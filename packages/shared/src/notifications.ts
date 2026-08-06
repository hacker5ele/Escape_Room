import { z } from 'zod'
import { publicProfileSchema } from './profiles.js'

/**
 * Everything that can tell a player something happened.
 *
 * The union is deliberately wider than what is implemented today. Notifications
 * are infrastructure, not a friend-request feature — the next thing that needs
 * to tell somebody something should add a member here and nothing else.
 */
export const NOTIFICATION_TYPES = [
  'friend_request',
  'friend_accepted',
  'message',
  'party_invite',
  'room_solved',
] as const

export type NotificationType = (typeof NOTIFICATION_TYPES)[number]

export const notificationTypeSchema = z.enum(NOTIFICATION_TYPES)

export const notificationSchema = z.object({
  id: z.string(),
  type: notificationTypeSchema,
  createdAt: z.string(),
  /** ISO 8601 once seen, null while unread. */
  readAt: z.string().nullable(),
  /**
   * Who caused it, resolved at read time rather than stored.
   *
   * Storing a copy would freeze their avatar and display name at the moment the
   * notification was written, so a week-old notification would show a face they
   * have since changed. Null when nobody in particular caused it.
   */
  actor: publicProfileSchema.nullable(),
  /** Already-composed text. The client renders it, it does not assemble it. */
  message: z.string(),
})

export type Notification = z.infer<typeof notificationSchema>

/**
 * The single poll that answers "has anything happened?".
 *
 * One endpoint rather than one per feature: App Runner does not support
 * WebSockets and its proxy caps a request at about thirty seconds, so polling
 * is the only option, and polling four endpoints on a timer costs four times as
 * much as polling one. See ADR-0025.
 */
export const syncResponseSchema = z.object({
  /**
   * The server's clock, to send back as `since` next time.
   *
   * The client's own clock is not used for this. A browser whose clock is
   * minutes fast would ask for notifications from the future and silently
   * receive nothing, which looks exactly like "nothing happened".
   */
  now: z.string(),
  /** New since `since`, oldest first. */
  notifications: z.array(notificationSchema),
  /**
   * Counted from the stored `readAt`, not from what was returned above, so the
   * badge stays right even if a poll misses something.
   */
  unreadCount: z.number().int().nonnegative(),
})

export type SyncResponse = z.infer<typeof syncResponseSchema>
