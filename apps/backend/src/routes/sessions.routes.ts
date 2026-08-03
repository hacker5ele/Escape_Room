import { Router } from 'express'
import { createSessionRequestSchema, type SessionResponse } from '@escape-room/shared'
import type { SessionService } from '../services/session.service.js'
import { ApiError } from '../http/api-error.js'

export function createSessionRoutes(sessions: SessionService): Router {
  const router = Router()

  // POST /api/sessions — start a new game.
  router.post('/', async (req, res) => {
    const parsed = createSessionRequestSchema.safeParse(req.body)
    if (!parsed.success) {
      throw ApiError.validation('playerName must be between 1 and 32 characters.')
    }

    const session = await sessions.create(parsed.data.playerName)
    const body: SessionResponse = { session }
    res.status(201).json(body)
  })

  // GET /api/sessions/:sessionId — rehydrate after a reload.
  router.get('/:sessionId', async (req, res) => {
    const sessionId = req.params.sessionId ?? ''
    const session = await sessions.require(sessionId)
    const body: SessionResponse = { session }
    res.json(body)
  })

  return router
}
