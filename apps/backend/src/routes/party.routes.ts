import { Router, type RequestHandler } from 'express'
import type { PartyResponse } from '@escape-room/shared'
import type { PartyService } from '../services/party.service.js'
import type { Authenticator } from '../http/authenticator.js'
import { requireUserId } from '../http/require-auth.js'
import { ApiError } from '../http/api-error.js'

export function createPartyRoutes(
  party: PartyService,
  authenticator: Authenticator,
  rateLimiter: RequestHandler,
): Router {
  const router = Router()

  const readUserId = (raw: unknown): string => {
    if (typeof raw !== 'string' || raw.length === 0 || raw.length > 128) {
      throw ApiError.validation('Not a valid user id.')
    }
    return raw
  }

  // GET /api/party — who am I playing with?
  router.get('/', async (req, res) => {
    const userId = await requireUserId(req, authenticator)
    const body: PartyResponse = { party: await party.of(userId) }
    res.setHeader('Cache-Control', 'no-store, private')
    res.json(body)
  })

  // POST /api/party/invite/:userId — ask a friend to come and play.
  router.post('/invite/:userId', rateLimiter, async (req, res) => {
    const userId = await requireUserId(req, authenticator)
    await party.invite(userId, readUserId(req.params.userId))
    res.status(204).end()
  })

  // POST /api/party/join/:userId — join that friend's game.
  router.post('/join/:userId', rateLimiter, async (req, res) => {
    const userId = await requireUserId(req, authenticator)
    const body: PartyResponse = { party: await party.join(userId, readUserId(req.params.userId)) }
    res.status(201).json(body)
  })

  // DELETE /api/party — go back to your own game.
  router.delete('/', rateLimiter, async (req, res) => {
    const userId = await requireUserId(req, authenticator)
    const body: PartyResponse = { party: await party.leave(userId) }
    res.json(body)
  })

  // DELETE /api/party/members/:userId — the host sending somebody home.
  router.delete('/members/:userId', rateLimiter, async (req, res) => {
    const userId = await requireUserId(req, authenticator)
    const body: PartyResponse = {
      party: await party.remove(userId, readUserId(req.params.userId)),
    }
    res.json(body)
  })

  return router
}
