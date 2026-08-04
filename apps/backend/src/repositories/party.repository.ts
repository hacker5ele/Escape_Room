import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import {
  DynamoDBDocumentClient,
  DeleteCommand,
  GetCommand,
  PutCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb'

/**
 * Which game a player is currently in.
 *
 * A row exists only while somebody is playing in *another* person's game. No
 * row means "playing my own", which is the overwhelmingly common case and costs
 * nothing to store.
 *
 * `hostUserId` is a user id rather than a synthetic game id on purpose. The
 * games table is already keyed on the owner's user id, so pointing at the host
 * turns "which game am I in?" into one extra key lookup and requires no change
 * to how games are stored. See ADR-0028.
 */
export interface PartyMemberRecord {
  userId: string
  hostUserId: string
  joinedAt: string
}

export interface PartyRepository {
  find(userId: string): Promise<PartyMemberRecord | null>
  put(record: PartyMemberRecord): Promise<void>
  remove(userId: string): Promise<void>
  /** Everybody who has joined this host's game. Does not include the host. */
  listMembers(hostUserId: string): Promise<PartyMemberRecord[]>
}

export class InMemoryPartyRepository implements PartyRepository {
  readonly #members = new Map<string, PartyMemberRecord>()

  async find(userId: string): Promise<PartyMemberRecord | null> {
    const found = this.#members.get(userId)
    return found ? structuredClone(found) : null
  }

  async put(record: PartyMemberRecord): Promise<void> {
    this.#members.set(record.userId, structuredClone(record))
  }

  async remove(userId: string): Promise<void> {
    this.#members.delete(userId)
  }

  async listMembers(hostUserId: string): Promise<PartyMemberRecord[]> {
    return [...this.#members.values()]
      .filter((record) => record.hostUserId === hostUserId)
      .map((record) => structuredClone(record))
  }
}

export class DynamoPartyRepository implements PartyRepository {
  readonly #client: DynamoDBDocumentClient
  readonly #tableName: string

  /** Matches the `global_secondary_index` name in the Terraform module. */
  static readonly HOST_INDEX = 'by-host'

  constructor(tableName: string, region: string) {
    this.#client = DynamoDBDocumentClient.from(new DynamoDBClient({ region }), {
      marshallOptions: { removeUndefinedValues: true },
    })
    this.#tableName = tableName
  }

  async find(userId: string): Promise<PartyMemberRecord | null> {
    const result = await this.#client.send(
      new GetCommand({
        TableName: this.#tableName,
        Key: { userId },
        // Read on every game request, so a stale answer would show somebody the
        // wrong game for a few seconds after joining.
        ConsistentRead: true,
      }),
    )
    return (result.Item as PartyMemberRecord | undefined) ?? null
  }

  async put(record: PartyMemberRecord): Promise<void> {
    await this.#client.send(new PutCommand({ TableName: this.#tableName, Item: record }))
  }

  async remove(userId: string): Promise<void> {
    await this.#client.send(new DeleteCommand({ TableName: this.#tableName, Key: { userId } }))
  }

  async listMembers(hostUserId: string): Promise<PartyMemberRecord[]> {
    const result = await this.#client.send(
      new QueryCommand({
        TableName: this.#tableName,
        IndexName: DynamoPartyRepository.HOST_INDEX,
        KeyConditionExpression: 'hostUserId = :host',
        ExpressionAttributeValues: { ':host': hostUserId },
      }),
    )
    return (result.Items ?? []) as PartyMemberRecord[]
  }
}
