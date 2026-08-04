import { Router, type RequestHandler } from 'express'
import { sendMessageRequestSchema, type Message, type MessageListResponse } from '@escape-room/shared'
import type { ChatService } from '../services/chat.service.js'
import type { Authenticator } from '../http/authenticator.js'
import { requireUserId } from '../http/require-auth.js'
import { ApiError } from '../http/api-error.js'

/**
 * Chat, addressed by *person* rather than by conversation.
 *
 * There is deliberately no conversation id in any URL. The server derives it
 * from the caller's authenticated id and the friend they named, so there is no
 * request shape in which somebody can ask for a conversation they are not part
 * of. See ADR-0026.
 */
export function createChatRoutes(
  chat: ChatService,
  authenticator: Authenticator,
  sendRateLimiter: RequestHandler,
  readRateLimiter: RequestHandler,
): Router {
  const router = Router()

  const readFriendId = (raw: unknown): string => {
    if (typeof raw !== 'string' || raw.length === 0 || raw.length > 128) {
      throw ApiError.validation('Not a valid user id.')
    }
    return raw
  }

  router.get('/:userId/messages', readRateLimiter, async (req, res) => {
    const userId = await requireUserId(req, authenticator)
    const since = typeof req.query.since === 'string' ? req.query.since : undefined

    const body: MessageListResponse = {
      messages: await chat.history(userId, readFriendId(req.params.userId), since),
    }

    // Personal and polled — never store it, and never in a shared cache.
    res.setHeader('Cache-Control', 'no-store, private')
    res.json(body)
  })

  router.post('/:userId/messages', sendRateLimiter, async (req, res) => {
    const userId = await requireUserId(req, authenticator)

    const parsed = sendMessageRequestSchema.safeParse(req.body)
    if (!parsed.success) {
      throw ApiError.validation('A message must have some text, and not too much of it.')
    }

    const message: Message = await chat.send(
      userId,
      readFriendId(req.params.userId),
      parsed.data.body,
    )
    res.status(201).json({ message })
  })

  return router
}
