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
  /**
   * Everything after `afterSk`, or the whole list when it is null.
   *
   * Null is the only way to say "from the beginning". An empty string is not —
   * DynamoDB rejects it as a key value, and the in-memory implementation below
   * refuses it too so that the two behave alike where it matters.
   */
  listSince(
    userId: string,
    afterSk: string | null,
    limit: number,
  ): Promise<NotificationRecord[]>
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

  async listSince(
    userId: string,
    afterSk: string | null,
    limit: number,
  ): Promise<NotificationRecord[]> {
    assertUsableKey(afterSk)
    const all = this.#byUser.get(userId) ?? []
    return all
      .filter((record) => afterSk === null || record.sk > afterSk)
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

  async listSince(
    userId: string,
    afterSk: string | null,
    limit: number,
  ): Promise<NotificationRecord[]> {
    assertUsableKey(afterSk)
    // The condition is *omitted* rather than widened when there is no cursor.
    // There is no key value meaning "before everything" — an empty string is
    // rejected outright — so the only correct unbounded query is one that does
    // not mention the sort key at all.
    const result = await this.#client.send(
      new QueryCommand({
        TableName: this.#tableName,
        KeyConditionExpression:
          afterSk === null ? 'userId = :u' : 'userId = :u AND sk > :after',
        ExpressionAttributeValues:
          afterSk === null ? { ':u': userId } : { ':u': userId, ':after': afterSk },
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

/**
 * Refuses a key value DynamoDB would refuse.
 *
 * This is the guard that would have caught the bug it exists because of. The
 * empty-string cursor crashed every first sync poll in production for days
 * while all 227 tests passed — because the in-memory repository compared
 * against `''` quite happily and DynamoDB does not.
 *
 * **An in-memory stand-in must be at least as strict as the real thing.** Where
 * it is more permissive it does not simulate the database, it hides it, and the
 * difference is only ever discovered in production.
 */
export function assertUsableKey(value: string | null): void {
  if (value === '') {
    throw new Error(
      'A sort key cursor may not be an empty string — DynamoDB rejects it. Use null for "from the beginning".',
    )
  }
}
