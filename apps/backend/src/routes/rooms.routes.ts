import { Router, type RequestHandler } from 'express'
import {
  attemptRequestSchema,
  type AttemptResponse,
  type RoomCompleteResponse,
  type RoomResetResponse,
  type RoomResponse,
  type RoomsResponse,
} from '@escape-room/shared'
import type { RoomService } from '../services/room.service.js'
import type { GameService } from '../services/game.service.js'
import type { Authenticator } from '../http/authenticator.js'
import { requireGame } from '../http/require-auth.js'
import { readRoomId } from '../http/request.js'
import { ApiError } from '../http/api-error.js'

export function createRoomRoutes(
  games: GameService,
  rooms: RoomService,
  authenticator: Authenticator,
  attemptRateLimiter: RequestHandler,
): Router {
  const router = Router()

  // Every handler below resolves the game from the verified caller, so no
  // route can be tricked into operating on somebody else's progress.

  // GET /api/rooms — the map. Metadata only, no puzzle data.
  router.get('/', async (req, res) => {
    const game = await requireGame(req, authenticator, games)
    const body: RoomsResponse = { rooms: rooms.listRooms(game) }
    res.json(body)
  })

  // GET /api/rooms/:roomId — 403 unless every preceding room is solved.
  router.get('/:roomId', async (req, res) => {
    const roomId = readRoomId(req)
    const game = await requireGame(req, authenticator, games)

    // Resolve the payload first: if the room is locked this throws, and a
    // refused entry should not appear in the player's history as an entry.
    const body: RoomResponse = { room: rooms.getRoom(game, roomId) }

    // Only writes on the first visit, so refreshing does not turn this GET
    // into a stream of writes.
    await games.recordRoomEntered(game, roomId)

    res.json(body)
  })

  // POST /api/rooms/:roomId/attempt — the only place an answer is checked.
  router.post('/:roomId/attempt', attemptRateLimiter, async (req, res) => {
    const roomId = readRoomId(req)
    const game = await requireGame(req, authenticator, games)

    const parsed = attemptRequestSchema.safeParse(req.body)
    if (!parsed.success) {
      throw ApiError.validation('Request body must be an object with an "answer" field.')
    }

    const body: AttemptResponse = await rooms.attempt(game, roomId, parsed.data.answer)
    res.json(body)
  })

  // POST /api/rooms/:roomId/hint — server-side so hints can be counted.
  router.post('/:roomId/hint', async (req, res) => {
    const roomId = readRoomId(req)
    const game = await requireGame(req, authenticator, games)
    res.json(await rooms.hint(game, roomId))
  })

  // POST /api/rooms/:roomId/reset — wipes this room's progress only, leaving
  // the rest of the game untouched. See ADR-0023: used by room-03's Atlantis
  // quest, which has no other way to tell the server its own run failed.
  router.post('/:roomId/reset', async (req, res) => {
    const roomId = readRoomId(req)
    const game = await requireGame(req, authenticator, games)
    const body: RoomResetResponse = { session: await games.resetRoom(game, roomId) }
    res.json(body)
  })

  // POST /api/rooms/:roomId/complete — marks a room solved with no answer
  // involved, for a room whose final stage(s) are entirely client-side. See
  // ADR-0027: used once room-03's Olympus carpet race is won.
  router.post('/:roomId/complete', async (req, res) => {
    const roomId = readRoomId(req)
    const game = await requireGame(req, authenticator, games)
    const body: RoomCompleteResponse = { session: await rooms.complete(game, roomId) }
    res.json(body)
  })

  return router
}
