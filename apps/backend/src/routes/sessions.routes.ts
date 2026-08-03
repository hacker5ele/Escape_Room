import { Router } from 'express'
import type { SessionResponse } from '@escape-room/shared'
import type { GameService } from '../services/game.service.js'
import type { Authenticator } from '../http/authenticator.js'
import { requireGame, requireUserId } from '../http/require-auth.js'

export function createSessionRoutes(games: GameService, authenticator: Authenticator): Router {
  const router = Router()

  // POST /api/sessions — start playing, or pick up where you left off.
  // Idempotent, so opening a second tab cannot create a second game.
  router.post('/', async (req, res) => {
    const userId = await requireUserId(req, authenticator)
    // The profile is resolved here rather than inside the service, so the
    // service never has to know which identity provider is in use.
    const profile = await authenticator.profile(req, userId)
    const body: SessionResponse = { session: await games.startOrResume(userId, profile) }
    res.status(201).json(body)
  })

  // GET /api/sessions/me — the caller's game. No id in the URL: there is only
  // ever one game per account, and the server knows which account is calling.
  router.get('/me', async (req, res) => {
    const body: SessionResponse = { session: await requireGame(req, authenticator, games) }
    res.json(body)
  })

  // DELETE /api/sessions/me — start over from room one.
  router.delete('/me', async (req, res) => {
    const userId = await requireUserId(req, authenticator)
    await games.reset(userId)
    res.status(204).end()
  })

  return router
}
