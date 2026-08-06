import { Router, type RequestHandler } from 'express'
import type { HeartbeatResponse } from '@escape-room/shared'
import {
  aliveRequestSchema,
  heartbeatRequestSchema,
  isRoomId,
  partyPhaseSchema,
} from '@escape-room/shared'
import type { PresenceService } from '../services/presence.service.js'
import type { LiveStore } from '../services/live-store.js'
import type { PartyService } from '../services/party.service.js'
import type { GameService } from '../services/game.service.js'
import type { Authenticator } from '../http/authenticator.js'
import { requireUserId } from '../http/require-auth.js'
import { ApiError } from '../http/api-error.js'

/**
 * The stage: where everybody is, and where the party is going.
 *
 * Deliberately **not** part of `/api/sync`, despite ADR-0025 saying features
 * should add fields there rather than take an endpoint of their own. That rule
 * exists because polling four endpoints costs four times as much as polling
 * one — which assumes they want the same cadence. Presence wants 500 ms and
 * notifications want ten seconds, so folding them together would poll
 * notifications twenty times more often than they deserve. Splitting is
 * *cheaper* here, and the ADR's own reasoning is what says so.
 */
export function createPresenceRoutes(
  presence: PresenceService,
  live: LiveStore,
  party: PartyService,
  games: GameService,
  authenticator: Authenticator,
  rateLimiter: RequestHandler,
): Router {
  const router = Router()

  // POST /api/stage/heartbeat — I am here; where is everybody else?
  router.post('/heartbeat', rateLimiter, async (req, res) => {
    const userId = await requireUserId(req, authenticator)

    const parsed = heartbeatRequestSchema.safeParse(req.body)
    if (!parsed.success) {
      throw ApiError.validation('That is not a valid position.')
    }

    const body: HeartbeatResponse = await presence.beat(userId, parsed.data)

    // Polled twice a second and personal to one account. A cached copy would be
    // both stale and, through a shared cache, somebody else's.
    res.setHeader('Cache-Control', 'no-store, private')
    res.json(body)
  })

  // POST /api/stage/phase — the host moves the whole party.
  router.post('/phase', rateLimiter, async (req, res) => {
    const userId = await requireUserId(req, authenticator)

    const parsed = partyPhaseSchema.safeParse(req.body)
    if (!parsed.success) {
      throw ApiError.validation('That is not a place the party can be.')
    }

    // Only the host moves anybody. A guest pointing at somebody else's game
    // cannot drag the party into a room, which is the same rule co-op already
    // enforces about whose game is being played (ADR-0028).
    const host = await party.hostOf(userId)
    if (host !== userId) {
      throw new ApiError(403, 'NOT_HOST', 'Only the host can start a room.')
    }

    // Re-checked here rather than trusted from the lobby, because the selection
    // could have been made before the game changed. The room endpoint refuses a
    // locked room anyway (ADR-0006) — this stops the party being walked into
    // that refusal together.
    if (parsed.data.kind === 'room') {
      const game = await games.find(userId)
      if (!game || !isRoomId(parsed.data.roomId)) {
        throw ApiError.validation('That is not a room you can open.')
      }
    }

    presence.setPhase(userId, parsed.data)
    res.status(204).end()
  })

  /**
   * POST /api/stage/alive — I still have the game open.
   *
   * The same beat as a heartbeat with the position left off, sent every five
   * seconds from every screen rather than only from the stage. You can be in a
   * friend's game while reading the leaderboard, and a claim nobody is renewing
   * is a claim that has ended (ADR-0045) — so without this, tabbing to another
   * page would quietly drop you out of their game.
   *
   * Answers `204`. Where the party is travels on the heartbeat, and somebody
   * who is not on the stage is not following it anywhere.
   */
  router.post('/alive', rateLimiter, async (req, res) => {
    const userId = await requireUserId(req, authenticator)

    const parsed = aliveRequestSchema.safeParse(req.body)
    if (!parsed.success) {
      throw ApiError.validation('That is not a valid beat.')
    }

    live.alive(userId, parsed.data.hidden)
    res.status(204).end()
  })

  /**
   * DELETE /api/stage — take me off the stage.
   *
   * Your character leaves the room; your claim on the party does not. Walking
   * out of the lobby to look at the leaderboard is the one departure that is a
   * real click rather than a guess about an unloading page, so it is the one
   * that happens at once rather than on a timeout.
   */
  router.delete('/', rateLimiter, async (req, res) => {
    const userId = await requireUserId(req, authenticator)
    presence.leaveStage(userId)
    res.status(204).end()
  })

  return router
}
