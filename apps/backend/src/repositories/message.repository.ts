import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb'
import { sortKeyFor } from './sort-key.js'

export { sortKeyFor }

export interface MessageRecord {
  conversationId: string
  /** `${createdAt}#${id}`, as with notifications. */
  sk: string
  id: string
  authorUserId: string
  body: string
  createdAt: string
}

export interface MessageRepository {
  add(record: MessageRecord): Promise<void>
  /** Oldest first. `afterSk` of '' means from the beginning. */
  list(conversationId: string, afterSk: string, limit: number): Promise<MessageRecord[]>
  /** Newest first — used to fill a freshly opened window. */
  listRecent(conversationId: string, limit: number): Promise<MessageRecord[]>
}

export class InMemoryMessageRepository implements MessageRepository {
  readonly #byConversation = new Map<string, MessageRecord[]>()

  async add(record: MessageRecord): Promise<void> {
    const list = this.#byConversation.get(record.conversationId) ?? []
    list.push(structuredClone(record))
    list.sort((a, b) => a.sk.localeCompare(b.sk))
    this.#byConversation.set(record.conversationId, list)
  }

  async list(conversationId: string, afterSk: string, limit: number): Promise<MessageRecord[]> {
    return (this.#byConversation.get(conversationId) ?? [])
      .filter((record) => record.sk > afterSk)
      .slice(0, limit)
      .map((record) => structuredClone(record))
  }

  async listRecent(conversationId: string, limit: number): Promise<MessageRecord[]> {
    const all = this.#byConversation.get(conversationId) ?? []
    return all.slice(Math.max(0, all.length - limit)).map((record) => structuredClone(record))
  }
}

export class DynamoMessageRepository implements MessageRepository {
  readonly #client: DynamoDBDocumentClient
  readonly #tableName: string

  constructor(tableName: string, region: string) {
    this.#client = DynamoDBDocumentClient.from(new DynamoDBClient({ region }), {
      marshallOptions: { removeUndefinedValues: true },
    })
    this.#tableName = tableName
  }

  async add(record: MessageRecord): Promise<void> {
    await this.#client.send(new PutCommand({ TableName: this.#tableName, Item: record }))
  }

  async list(conversationId: string, afterSk: string, limit: number): Promise<MessageRecord[]> {
    const result = await this.#client.send(
      new QueryCommand({
        TableName: this.#tableName,
        KeyConditionExpression: 'conversationId = :c AND sk > :after',
        ExpressionAttributeValues: { ':c': conversationId, ':after': afterSk },
        Limit: limit,
        // A message you just sent must be in the next poll, or the conversation
        // appears to swallow it.
        ConsistentRead: true,
      }),
    )
    return (result.Items ?? []) as MessageRecord[]
  }

  async listRecent(conversationId: string, limit: number): Promise<MessageRecord[]> {
    const result = await this.#client.send(
      new QueryCommand({
        TableName: this.#tableName,
        KeyConditionExpression: 'conversationId = :c',
        ExpressionAttributeValues: { ':c': conversationId },
        // Newest first, then reversed below — the alternative is reading the
        // whole conversation to find its end.
        ScanIndexForward: false,
        Limit: limit,
        ConsistentRead: true,
      }),
    )
    return ((result.Items ?? []) as MessageRecord[]).reverse()
  }
}
