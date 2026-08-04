import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import {
  DynamoDBDocumentClient,
  PutCommand,
  QueryCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb'
import type { NotificationType } from '@escape-room/shared'
import { sortKeyFor } from './sort-key.js'

export { sortKeyFor }

export interface NotificationRecord {
  userId: string
  /**
   * `${createdAt}#${id}` — the sort key.
   *
   * `toISOString()` is fixed-width UTC to the millisecond, so it sorts
   * lexicographically in true chronological order. The id breaks ties between
   * two notifications written in the same millisecond.
   */
  sk: string
  id: string
  type: NotificationType
  createdAt: string
  readAt: string | null
  actorUserId: string | null
  message: string
  /** Unix seconds, for DynamoDB's TTL reaper. */
  expiresAtEpoch: number
}

export interface NotificationRepository {
  add(record: NotificationRecord): Promise<void>
  /** Everything newer than `afterSk`, oldest first. Pass '' for everything. */
  listSince(userId: string, afterSk: string, limit: number): Promise<NotificationRecord[]>
  countUnread(userId: string): Promise<number>
  /**
   * Is there already an unread one of this kind from this person?
   *
   * Chat asks this before adding "you have a new message". Without it, a
   * five-message burst becomes five bell notifications saying the same thing.
   */
  hasUnreadFrom(userId: string, type: NotificationType, actorUserId: string): Promise<boolean>
  markAllRead(userId: string, at: string): Promise<void>
}

export class InMemoryNotificationRepository implements NotificationRepository {
  readonly #byUser = new Map<string, NotificationRecord[]>()

  async add(record: NotificationRecord): Promise<void> {
    const list = this.#byUser.get(record.userId) ?? []
    list.push(structuredClone(record))
    list.sort((a, b) => a.sk.localeCompare(b.sk))
    this.#byUser.set(record.userId, list)
  }

  async listSince(userId: string, afterSk: string, limit: number): Promise<NotificationRecord[]> {
    return (this.#byUser.get(userId) ?? [])
      .filter((record) => record.sk > afterSk)
      .slice(0, limit)
      .map((record) => structuredClone(record))
  }

  async countUnread(userId: string): Promise<number> {
    return (this.#byUser.get(userId) ?? []).filter((record) => record.readAt === null).length
  }

  async hasUnreadFrom(
    userId: string,
    type: NotificationType,
    actorUserId: string,
  ): Promise<boolean> {
    return (this.#byUser.get(userId) ?? []).some(
      (record) =>
        record.readAt === null && record.type === type && record.actorUserId === actorUserId,
    )
  }

  async markAllRead(userId: string, at: string): Promise<void> {
    for (const record of this.#byUser.get(userId) ?? []) {
      if (record.readAt === null) record.readAt = at
    }
  }
}

export class DynamoNotificationRepository implements NotificationRepository {
  readonly #client: DynamoDBDocumentClient
  readonly #tableName: string

  constructor(tableName: string, region: string) {
    this.#client = DynamoDBDocumentClient.from(new DynamoDBClient({ region }), {
      marshallOptions: { removeUndefinedValues: true },
    })
    this.#tableName = tableName
  }

  async add(record: NotificationRecord): Promise<void> {
    await this.#client.send(new PutCommand({ TableName: this.#tableName, Item: record }))
  }

  async listSince(userId: string, afterSk: string, limit: number): Promise<NotificationRecord[]> {
    const result = await this.#client.send(
      new QueryCommand({
        TableName: this.#tableName,
        KeyConditionExpression: 'userId = :u AND sk > :after',
        ExpressionAttributeValues: { ':u': userId, ':after': afterSk },
        Limit: limit,
        // Strongly consistent: a poll immediately after an action that caused a
        // notification should see it, and an eventually-consistent read here
        // shows up as a badge that appears seconds late for no visible reason.
        ConsistentRead: true,
      }),
    )
    return (result.Items ?? []) as NotificationRecord[]
  }

  async countUnread(userId: string): Promise<number> {
    // Filtered rather than indexed. A filter still reads the whole partition,
    // which is the right trade at this size — a class of players over one week,
    // with a 30-day TTL keeping each partition small. If notification volume
    // ever grows, this becomes a counter item updated with ADD.
    let count = 0
    let startKey: Record<string, unknown> | undefined

    do {
      const result = await this.#client.send(
        new QueryCommand({
          TableName: this.#tableName,
          KeyConditionExpression: 'userId = :u',
          FilterExpression: 'attribute_not_exists(readAt) OR readAt = :null',
          ExpressionAttributeValues: { ':u': userId, ':null': null },
          Select: 'COUNT',
          ExclusiveStartKey: startKey,
        }),
      )
      count += result.Count ?? 0
      startKey = result.LastEvaluatedKey
    } while (startKey)

    return count
  }

  async hasUnreadFrom(
    userId: string,
    type: NotificationType,
    actorUserId: string,
  ): Promise<boolean> {
    let startKey: Record<string, unknown> | undefined

    do {
    const result = await this.#client.send(
      new QueryCommand({
        TableName: this.#tableName,
        KeyConditionExpression: 'userId = :u',
        FilterExpression:
          '(attribute_not_exists(readAt) OR readAt = :null) AND #type = :type AND actorUserId = :actor',
        ExpressionAttributeNames: { '#type': 'type' },
        ExpressionAttributeValues: {
          ':u': userId,
          ':null': null,
          ':type': type,
          ':actor': actorUserId,
        },
        // No `Limit` here, deliberately. DynamoDB applies Limit *before* the
        // filter, so `Limit: 1` reads a single item — the oldest in the
        // partition — filters it away and reports nothing unread. The bell then
        // rings on every single message, which is the exact behaviour this
        // method exists to prevent, and it looks like it is working because a
        // notification does appear.
        ProjectionExpression: 'id',
        ExclusiveStartKey: startKey,
      }),
    )

    if ((result.Items?.length ?? 0) > 0) return true
    startKey = result.LastEvaluatedKey
  } while (startKey)

  return false
  }

  async markAllRead(userId: string, at: string): Promise<void> {
    // Read the unread keys, then update each. There is no bulk update in
    // DynamoDB, and at this volume a handful of writes is cheaper to reason
    // about than a counter that can drift out of step with the items.
    let startKey: Record<string, unknown> | undefined

    do {
      const result = await this.#client.send(
        new QueryCommand({
          TableName: this.#tableName,
          KeyConditionExpression: 'userId = :u',
          FilterExpression: 'attribute_not_exists(readAt) OR readAt = :null',
          ExpressionAttributeValues: { ':u': userId, ':null': null },
          ProjectionExpression: 'userId, sk',
          ExclusiveStartKey: startKey,
        }),
      )

      for (const item of (result.Items ?? []) as Array<{ userId: string; sk: string }>) {
        await this.#client.send(
          new UpdateCommand({
            TableName: this.#tableName,
            Key: { userId: item.userId, sk: item.sk },
            UpdateExpression: 'SET readAt = :at',
            ExpressionAttributeValues: { ':at': at },
          }),
        )
      }

      startKey = result.LastEvaluatedKey
    } while (startKey)
  }
}
