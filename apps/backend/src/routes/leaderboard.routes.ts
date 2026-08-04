import { Router, type RequestHandler } from 'express'
import type { LeaderboardResponse } from '@escape-room/shared'
import type { LeaderboardService } from '../services/leaderboard.service.js'
import type { Authenticator } from '../http/authenticator.js'
import { requireUserId } from '../http/require-auth.js'

export function createLeaderboardRoutes(
  leaderboard: LeaderboardService,
  authenticator: Authenticator,
  rateLimiter: RequestHandler,
): Router {
  const router = Router()

  // Deliberately only ever "my friends". There is no way to ask for anybody
  // else's list, and no global board — a class leaderboard is a way to make the
  // slowest person feel bad in public.
  router.get('/friends', rateLimiter, async (req, res) => {
    const userId = await requireUserId(req, authenticator)
    const body: LeaderboardResponse = { entries: await leaderboard.friendsOf(userId) }

    res.setHeader('Cache-Control', 'no-store, private')
    res.json(body)
  })

  return router
}
