import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb'

export interface InviteRecord {
  token: string
  inviterUserId: string
  createdAt: string
  /** ISO 8601, or null for a link that does not expire. */
  expiresAt: string | null
  /** Unix seconds. DynamoDB's TTL only understands epoch numbers. */
  expiresAtEpoch?: number
  revokedAt: string | null
  useCount: number
}

export interface InviteRepository {
  create(invite: InviteRecord): Promise<InviteRecord>
  find(token: string): Promise<InviteRecord | null>
  listFor(inviterUserId: string): Promise<InviteRecord[]>
  revoke(token: string, at: string): Promise<void>
  recordUse(token: string): Promise<void>
}

export class InMemoryInviteRepository implements InviteRepository {
  readonly #invites = new Map<string, InviteRecord>()

  async create(invite: InviteRecord): Promise<InviteRecord> {
    this.#invites.set(invite.token, structuredClone(invite))
    return structuredClone(invite)
  }

  async find(token: string): Promise<InviteRecord | null> {
    const found = this.#invites.get(token)
    return found ? structuredClone(found) : null
  }

  async listFor(inviterUserId: string): Promise<InviteRecord[]> {
    return [...this.#invites.values()]
      .filter((invite) => invite.inviterUserId === inviterUserId)
      .map((invite) => structuredClone(invite))
  }

  async revoke(token: string, at: string): Promise<void> {
    const found = this.#invites.get(token)
    if (found) found.revokedAt = at
  }

  async recordUse(token: string): Promise<void> {
    const found = this.#invites.get(token)
    if (found) found.useCount += 1
  }
}

export class DynamoInviteRepository implements InviteRepository {
  readonly #client: DynamoDBDocumentClient
  readonly #tableName: string

  /** Matches the `global_secondary_index` name in the Terraform module. */
  static readonly INVITER_INDEX = 'by-inviter'

  constructor(tableName: string, region: string) {
    this.#client = DynamoDBDocumentClient.from(new DynamoDBClient({ region }), {
      marshallOptions: { removeUndefinedValues: true },
    })
    this.#tableName = tableName
  }

  async create(invite: InviteRecord): Promise<InviteRecord> {
    await this.#client.send(new PutCommand({ TableName: this.#tableName, Item: invite }))
    return invite
  }

  async find(token: string): Promise<InviteRecord | null> {
    const result = await this.#client.send(
      new GetCommand({ TableName: this.#tableName, Key: { token }, ConsistentRead: true }),
    )
    return (result.Item as InviteRecord | undefined) ?? null
  }

  async listFor(inviterUserId: string): Promise<InviteRecord[]> {
    const result = await this.#client.send(
      new QueryCommand({
        TableName: this.#tableName,
        IndexName: DynamoInviteRepository.INVITER_INDEX,
        KeyConditionExpression: 'inviterUserId = :inviter',
        ExpressionAttributeValues: { ':inviter': inviterUserId },
      }),
    )
    return (result.Items ?? []) as InviteRecord[]
  }

  async revoke(token: string, at: string): Promise<void> {
    await this.#client.send(
      new UpdateCommand({
        TableName: this.#tableName,
        Key: { token },
        UpdateExpression: 'SET revokedAt = :at',
        ExpressionAttributeValues: { ':at': at },
        // Only touch a link that exists; revoking a made-up token should not
        // create one.
        ConditionExpression: 'attribute_exists(#token)',
        ExpressionAttributeNames: { '#token': 'token' },
      }),
    )
  }

  async recordUse(token: string): Promise<void> {
    await this.#client.send(
      new UpdateCommand({
        TableName: this.#tableName,
        Key: { token },
        // An atomic counter rather than read-modify-write: two people accepting
        // the same link at once would otherwise each read 0 and each write 1.
        UpdateExpression: 'ADD useCount :one',
        ExpressionAttributeValues: { ':one': 1 },
      }),
    )
  }
}
