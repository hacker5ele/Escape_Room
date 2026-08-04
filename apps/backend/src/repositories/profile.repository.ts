import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import {
  BatchGetCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb'
import {
  normalizeUsername,
  publicProfileSchema,
  type PublicProfile,
} from '@escape-room/shared'

/**
 * Where the public face of each player is kept.
 *
 * Same shape as `GameRepository` — an interface with an in-memory
 * implementation for tests and local runs, and a DynamoDB one for deployments.
 * That is what keeps the suite offline and `docker compose` free of AWS
 * credentials.
 */
export interface ProfileRepository {
  save(profile: PublicProfile): Promise<PublicProfile>
  findByUserId(userId: string): Promise<PublicProfile | null>
  findByUsername(username: string): Promise<PublicProfile | null>
  /** Bulk lookup for rendering a list of people. Order is not guaranteed. */
  findManyByUserId(userIds: string[]): Promise<PublicProfile[]>
}

/** What DynamoDB stores: the profile, plus the lower-cased key the index is on. */
interface StoredProfile extends PublicProfile {
  usernameLower: string
  updatedAt: string
}

export class InMemoryProfileRepository implements ProfileRepository {
  readonly #byUserId = new Map<string, PublicProfile>()

  async save(profile: PublicProfile): Promise<PublicProfile> {
    this.#byUserId.set(profile.userId, structuredClone(profile))
    return structuredClone(profile)
  }

  async findByUserId(userId: string): Promise<PublicProfile | null> {
    const found = this.#byUserId.get(userId)
    return found ? structuredClone(found) : null
  }

  async findByUsername(username: string): Promise<PublicProfile | null> {
    const wanted = normalizeUsername(username)
    for (const profile of this.#byUserId.values()) {
      if (normalizeUsername(profile.username) === wanted) return structuredClone(profile)
    }
    return null
  }

  async findManyByUserId(userIds: string[]): Promise<PublicProfile[]> {
    return userIds
      .map((userId) => this.#byUserId.get(userId))
      .filter((profile): profile is PublicProfile => profile !== undefined)
      .map((profile) => structuredClone(profile))
  }
}

export class DynamoProfileRepository implements ProfileRepository {
  readonly #client: DynamoDBDocumentClient
  readonly #tableName: string

  /** Matches the `global_secondary_index` name in the Terraform module. */
  static readonly USERNAME_INDEX = 'by-username'

  constructor(tableName: string, region: string) {
    this.#client = DynamoDBDocumentClient.from(new DynamoDBClient({ region }), {
      marshallOptions: { removeUndefinedValues: true },
    })
    this.#tableName = tableName
  }

  async save(profile: PublicProfile): Promise<PublicProfile> {
    const item: StoredProfile = {
      ...profile,
      usernameLower: normalizeUsername(profile.username),
      updatedAt: new Date().toISOString(),
    }
    await this.#client.send(new PutCommand({ TableName: this.#tableName, Item: item }))
    return profile
  }

  async findByUserId(userId: string): Promise<PublicProfile | null> {
    const result = await this.#client.send(
      new GetCommand({ TableName: this.#tableName, Key: { userId } }),
    )
    return parse(result.Item)
  }

  async findByUsername(username: string): Promise<PublicProfile | null> {
    const result = await this.#client.send(
      new QueryCommand({
        TableName: this.#tableName,
        IndexName: DynamoProfileRepository.USERNAME_INDEX,
        KeyConditionExpression: 'usernameLower = :username',
        ExpressionAttributeValues: { ':username': normalizeUsername(username) },
        Limit: 1,
        // A secondary index is eventually consistent and cannot be read
        // strongly, so a profile written a moment ago may not be findable by
        // username yet. Callers must treat "not found" as possibly-stale
        // rather than definitely-absent.
      }),
    )
    return parse(result.Items?.[0])
  }

  async findManyByUserId(userIds: string[]): Promise<PublicProfile[]> {
    if (userIds.length === 0) return []

    // BatchGetItem caps at 100 keys per call, and duplicate keys are rejected
    // outright — a friend list containing the same person twice would fail the
    // whole request rather than just that entry.
    const unique = [...new Set(userIds)]
    const batches: string[][] = []
    for (let i = 0; i < unique.length; i += 100) {
      batches.push(unique.slice(i, i + 100))
    }

    const results = await Promise.all(
      batches.map(async (batch) => {
        const result = await this.#client.send(
          new BatchGetCommand({
            RequestItems: {
              [this.#tableName]: { Keys: batch.map((userId) => ({ userId })) },
            },
          }),
        )
        return result.Responses?.[this.#tableName] ?? []
      }),
    )

    return results
      .flat()
      .map(parse)
      .filter((profile): profile is PublicProfile => profile !== null)
  }
}

/**
 * Parses rather than casts.
 *
 * The table is one of the few places data arrives from outside this codebase.
 * An item written by an older version of the app should fail here, visibly,
 * rather than halfway through rendering somebody's friend list.
 */
function parse(item: unknown): PublicProfile | null {
  if (!item) return null
  const parsed = publicProfileSchema.safeParse(item)
  return parsed.success ? parsed.data : null
}
