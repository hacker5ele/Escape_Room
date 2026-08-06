import { randomUUID } from 'node:crypto'
import { MAX_MESSAGE_LENGTH, type Message } from '@escape-room/shared'
import {
  sortKeyFor,
  type MessageRecord,
  type MessageRepository,
} from '../repositories/message.repository.js'
import type { FriendService } from './friend.service.js'
import type { NotificationService } from './notification.service.js'
import type { ProfileService } from './profile.service.js'
import { ApiError } from '../http/api-error.js'

/** Enough to fill a window; older messages are not paged in for now. */
const PAGE_SIZE = 100

/**
 * The id of the conversation between two people.
 *
 * Derived, never accepted from a client. Sorting the two ids means both sides
 * compute the same value without needing to agree in advance, and there is no
 * request in which a caller can name a conversation they are not part of — the
 * only inputs are their own authenticated id and the id of the person they
 * asked for, which is then checked against the friendship.
 *
 * This is the single most important line in the chat feature. If a client could
 * supply this, it could read anybody's messages. See ADR-0026.
 */
export function conversationIdFor(a: string, b: string): string {
  return [a, b].sort().join('#')
}

export class ChatService {
  constructor(
    private readonly repository: MessageRepository,
    private readonly friends: FriendService,
    private readonly profiles: ProfileService,
    private readonly notifications?: NotificationService,
  ) {}

  /**
   * Messages exchanged with one friend.
   *
   * `since` is a message id's sort key, so an open window can ask for only what
   * it has not seen. Without it, the most recent page is returned.
   */
  async history(userId: string, otherUserId: string, since?: string): Promise<Message[]> {
    const conversationId = await this.#requireFriendship(userId, otherUserId)

    const records = since
      ? await this.repository.list(conversationId, since, PAGE_SIZE)
      : await this.repository.listRecent(conversationId, PAGE_SIZE)

    return records.map(toMessage)
  }

  async send(userId: string, otherUserId: string, body: string): Promise<Message> {
    const conversationId = await this.#requireFriendship(userId, otherUserId)

    const trimmed = body.trim()
    if (trimmed.length === 0) throw ApiError.validation('Write something first.')
    if (trimmed.length > MAX_MESSAGE_LENGTH) {
      throw ApiError.validation(`Messages are limited to ${MAX_MESSAGE_LENGTH} characters.`)
    }

    const createdAt = new Date().toISOString()
    const id = randomUUID()

    const record: MessageRecord = {
      conversationId,
      sk: sortKeyFor(createdAt, id),
      id,
      authorUserId: userId,
      body: trimmed,
      createdAt,
    }

    await this.repository.add(record)
    await this.#tell(otherUserId, userId)

    return toMessage(record)
  }

  /**
   * Both directions of the friendship are checked on **every** read and write,
   * not once when a conversation is opened.
   *
   * Being unfriended or blocked has to close the conversation immediately;
   * checking only at open time would leave a window with an open tab in it
   * working indefinitely.
   */
  async #requireFriendship(userId: string, otherUserId: string): Promise<string> {
    if (userId === otherUserId) {
      throw new ApiError(400, 'CANNOT_FRIEND_SELF', 'You cannot message yourself.')
    }

    if (!(await this.friends.areFriends(userId, otherUserId))) {
      // The same error whether they were never a friend, unfriended you, or
      // blocked you — otherwise this endpoint reports which.
      throw new ApiError(403, 'NOT_FRIENDS', 'You can only message friends.')
    }

    return conversationIdFor(userId, otherUserId)
  }

  /**
   * One bell notification per unread conversation, not one per message.
   *
   * Somebody typing five lines in a row should produce one "you have a new
   * message", not five. Once the recipient has read it, the next message
   * notifies again.
   */
  async #tell(recipientUserId: string, authorUserId: string): Promise<void> {
    if (!this.notifications) return

    try {
      if (await this.notifications.hasUnreadFrom(recipientUserId, 'message', authorUserId)) return

      const author = await this.profiles.findByUserId(authorUserId)
      await this.notifications.notifyQuietly(
        recipientUserId,
        'message',
        `${author?.displayName || author?.username || 'Somebody'} sent you a message.`,
        authorUserId,
      )
    } catch {
      // A message that was stored must not fail because the courtesy about it
      // could not be.
    }
  }
}

function toMessage(record: MessageRecord): Message {
  return {
    id: record.id,
    authorUserId: record.authorUserId,
    body: record.body,
    createdAt: record.createdAt,
  }
}
