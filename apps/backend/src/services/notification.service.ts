import { randomUUID } from 'node:crypto'
import type { Notification, NotificationType, SyncResponse } from '@escape-room/shared'
import {
  sortKeyFor,
  type NotificationRecord,
  type NotificationRepository,
} from '../repositories/notification.repository.js'
import type { ProfileService } from './profile.service.js'

/** Long enough to be useful, short enough that a partition stays small. */
const RETENTION_DAYS = 30

/** At most this many per poll. A backlog drains over a few polls. */
const PAGE_SIZE = 50

/**
 * How far back a poll reaches beyond the cursor it was given.
 *
 * A notification's `createdAt` is stamped when the request starts, but the row
 * lands a few milliseconds later. A poll in that gap returns a cursor *newer*
 * than a row that has not appeared yet, and asking for strictly-newer next time
 * would skip it forever. Overlapping the window means the client sees some
 * notifications twice and none never — it dedupes by id, which is cheap, where
 * a lost notification is invisible and permanent.
 */
const OVERLAP_MS = 5_000

export class NotificationService {
  constructor(
    private readonly repository: NotificationRepository,
    private readonly profiles: ProfileService,
  ) {}

  /**
   * Records something that happened.
   *
   * Never throws into the caller's path — see `notifyQuietly`. A notification
   * is a courtesy; failing to store one must not fail the action that caused
   * it.
   */
  async notify(
    userId: string,
    type: NotificationType,
    message: string,
    actorUserId: string | null = null,
  ): Promise<void> {
    const createdAt = new Date().toISOString()
    const id = randomUUID()

    const record: NotificationRecord = {
      userId,
      sk: sortKeyFor(createdAt, id),
      id,
      type,
      createdAt,
      readAt: null,
      actorUserId,
      message,
      expiresAtEpoch: Math.floor(Date.parse(createdAt) / 1000) + RETENTION_DAYS * 86_400,
    }

    await this.repository.add(record)
  }

  /**
   * As `notify`, but swallows failures.
   *
   * Used from inside actions like accepting a friend request, where the write
   * that matters has already succeeded. Rolling that back because a courtesy
   * message could not be stored would be strictly worse than a missing badge.
   */
  async notifyQuietly(
    userId: string,
    type: NotificationType,
    message: string,
    actorUserId: string | null = null,
  ): Promise<void> {
    try {
      await this.notify(userId, type, message, actorUserId)
    } catch (error) {
      console.error('Could not store a notification', { userId, type, error })
    }
  }

  /** The one poll. */
  async sync(userId: string, since: string | undefined): Promise<SyncResponse> {
    const now = new Date().toISOString()
    const records = await this.repository.listSince(userId, cursorFor(since), PAGE_SIZE)

    // One profile lookup for the whole page rather than one per row.
    const actorIds = records
      .map((record) => record.actorUserId)
      .filter((id): id is string => id !== null)
    const actors = await this.profiles.mapOf(actorIds)

    const notifications: Notification[] = records.map((record) => ({
      id: record.id,
      type: record.type,
      createdAt: record.createdAt,
      readAt: record.readAt,
      // Resolved now, so an avatar changed since is the one that renders.
      actor: record.actorUserId ? (actors.get(record.actorUserId) ?? null) : null,
      message: record.message,
    }))

    return {
      now,
      notifications,
      // From storage, not from the page above, so the badge is right even when
      // the cursor missed something or the page was truncated.
      unreadCount: await this.repository.countUnread(userId),
    }
  }

  /** Used by chat to avoid one bell notification per message. */
  async hasUnreadFrom(
    userId: string,
    type: NotificationType,
    actorUserId: string,
  ): Promise<boolean> {
    return this.repository.hasUnreadFrom(userId, type, actorUserId)
  }

  async markAllRead(userId: string): Promise<void> {
    await this.repository.markAllRead(userId, new Date().toISOString())
  }
}

/**
 * Turns a client-supplied `since` into a sort-key lower bound.
 *
 * Anything unparseable — a truncated string, a hand-edited query parameter —
 * falls back to "everything", which is a slow first poll rather than a silent
 * gap in what the player sees.
 */
function cursorFor(since: string | undefined): string {
  if (!since) return ''

  const parsed = Date.parse(since)
  if (Number.isNaN(parsed)) return ''

  return sortKeyFor(new Date(parsed - OVERLAP_MS).toISOString(), '')
}
