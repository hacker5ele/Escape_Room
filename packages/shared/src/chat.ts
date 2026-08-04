import { z } from 'zod'

/**
 * The longest a single message may be.
 *
 * Bounded because a message is stored, polled and re-sent to everyone in the
 * conversation — an unbounded field is a way to make every future poll
 * expensive for somebody else. Generous enough that nobody writing normally
 * will meet it.
 */
export const MAX_MESSAGE_LENGTH = 2_000

export const messageSchema = z.object({
  id: z.string(),
  /** Who wrote it. The client matches this against its own id to pick a side. */
  authorUserId: z.string(),
  body: z.string(),
  createdAt: z.string(),
})

export type Message = z.infer<typeof messageSchema>

/**
 * What the client may send.
 *
 * Note what is *not* here: no conversation id, no author, no timestamp. All
 * three are decided by the server. A client that could name its own
 * conversation could name somebody else's. See ADR-0026.
 */
export const sendMessageRequestSchema = z.object({
  body: z.string().trim().min(1).max(MAX_MESSAGE_LENGTH),
})

export type SendMessageRequest = z.infer<typeof sendMessageRequestSchema>

export const messageListResponseSchema = z.object({
  messages: z.array(messageSchema),
})

export type MessageListResponse = z.infer<typeof messageListResponseSchema>
