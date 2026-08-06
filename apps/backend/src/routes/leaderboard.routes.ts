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

  // Always "my friends" — there is no way to ask for somebody else's list.
  router.get('/friends', rateLimiter, async (req, res) => {
    const userId = await requireUserId(req, authenticator)
    const body: LeaderboardResponse = { entries: await leaderboard.friendsOf(userId) }

    res.setHeader('Cache-Control', 'no-store, private')
    res.json(body)
  })

  // Everybody, added in ADR-0034. Same response shape as the friends board, so
  // the client renders one component either way.
  //
  // Takes no parameters at all: the caller cannot choose the size, the offset
  // or the sort. That keeps the one scan in the app a fixed, cacheable cost
  // rather than something a client can make expensive.
  router.get('/global', rateLimiter, async (req, res) => {
    const userId = await requireUserId(req, authenticator)
    const body: LeaderboardResponse = { entries: await leaderboard.global(userId) }

    // Still private, because `isMe` differs per caller — the rows are public
    // but the response is personalised.
    res.setHeader('Cache-Control', 'no-store, private')
    res.json(body)
  })

  return router
}
