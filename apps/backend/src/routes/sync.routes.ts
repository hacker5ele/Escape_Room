import { Router, type RequestHandler } from 'express'
import type { SyncResponse } from '@escape-room/shared'
import type { NotificationService } from '../services/notification.service.js'
import type { Authenticator } from '../http/authenticator.js'
import { requireUserId } from '../http/require-auth.js'

/**
 * The polling spine.
 *
 * One endpoint answers "has anything happened?" for the whole app. App Runner
 * does not support WebSockets and its proxy cuts a request at about thirty
 * seconds, so server-sent events are impractical too — polling is what is left.
 * Given that, polling *once* for everything rather than once per feature is the
 * difference between one request every few seconds and four. See ADR-0025.
 *
 * Chat and co-op will add fields to the same response rather than endpoints of
 * their own.
 */
export function createSyncRoutes(
  notifications: NotificationService,
  authenticator: Authenticator,
  rateLimiter: RequestHandler,
): Router {
  const router = Router()

  router.get('/', rateLimiter, async (req, res) => {
    const userId = await requireUserId(req, authenticator)

    // Anything unparseable is treated as absent by the service, which returns
    // the most recent page instead. A bad cursor costs one large response, not
    // a silent gap.
    const since = typeof req.query.since === 'string' ? req.query.since : undefined

    const body: SyncResponse = await notifications.sync(userId, since)

    // Polled every few seconds and personal to one account — a cached copy
    // would be both stale and, through a shared cache, somebody else's.
    res.setHeader('Cache-Control', 'no-store, private')
    res.json(body)
  })

  // Opening the bell marks the lot read. Per-notification read state is more
  // machinery than a badge needs.
  router.post('/read', rateLimiter, async (req, res) => {
    const userId = await requireUserId(req, authenticator)
    await notifications.markAllRead(userId)
    res.status(204).end()
  })

  return router
}
