import { Router, type RequestHandler } from 'express'
import {
  attemptRequestSchema,
  type AttemptResponse,
  type RoomResponse,
  type RoomsResponse,
} from '@escape-room/shared'
import type { RoomService } from '../services/room.service.js'
import type { SessionService } from '../services/session.service.js'
import { readRoomId, readSessionId } from '../http/request.js'
import { ApiError } from '../http/api-error.js'

export function createRoomRoutes(
  sessions: SessionService,
  rooms: RoomService,
  attemptRateLimiter: RequestHandler,
): Router {
  const router = Router()

  // GET /api/rooms — the map. Metadata only, no puzzle data.
  router.get('/', async (req, res) => {
    const session = await sessions.require(readSessionId(req))
    const body: RoomsResponse = { rooms: rooms.listRooms(session) }
    res.json(body)
  })

  // GET /api/rooms/:roomId — 403 unless every preceding room is solved.
  router.get('/:roomId', async (req, res) => {
    const roomId = readRoomId(req)
    const session = await sessions.require(readSessionId(req))
    const body: RoomResponse = { room: rooms.getRoom(session, roomId) }
    res.json(body)
  })

  // POST /api/rooms/:roomId/attempt — the only place an answer is checked.
  router.post('/:roomId/attempt', attemptRateLimiter, async (req, res) => {
    const roomId = readRoomId(req)
    const session = await sessions.require(readSessionId(req))

    const parsed = attemptRequestSchema.safeParse(req.body)
    if (!parsed.success) {
      throw ApiError.validation('Request body must be an object with an "answer" field.')
    }

    const body: AttemptResponse = await rooms.attempt(session, roomId, parsed.data.answer)
    res.json(body)
  })

  // POST /api/rooms/:roomId/hint — server-side so hints can be counted.
  router.post('/:roomId/hint', async (req, res) => {
    const roomId = readRoomId(req)
    const session = await sessions.require(readSessionId(req))
    res.json(await rooms.hint(session, roomId))
  })

  return router
}
