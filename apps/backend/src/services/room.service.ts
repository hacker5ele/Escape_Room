import {
  isRoomSolved,
  isRoomUnlocked,
  roomOrder,
  ROOM_IDS,
  type AttemptResponse,
  type GameSession,
  type HintResponse,
  type RoomId,
  type RoomPublicData,
  type RoomSummary,
} from '@escape-room/shared'
import { getRoom } from '../domain/rooms/index.js'
import { ApiError } from '../http/api-error.js'
import type { SessionService } from './session.service.js'

export class RoomService {
  constructor(private readonly sessions: SessionService) {}

  /** Room metadata for the map/progress view. Deliberately carries no puzzle data. */
  listRooms(session: GameSession): RoomSummary[] {
    return ROOM_IDS.map((roomId) => ({
      id: roomId,
      order: roomOrder(roomId),
      title: getRoom(roomId).title,
      unlocked: isRoomUnlocked(session, roomId),
      solved: isRoomSolved(session, roomId),
    }))
  }

  /**
   * The gate. Everything the browser learns about a room comes through here,
   * and it refuses before the room can produce any payload at all.
   */
  getRoom(session: GameSession, roomId: RoomId): RoomPublicData {
    if (!isRoomUnlocked(session, roomId)) throw ApiError.roomLocked()

    const room = getRoom(roomId)
    return {
      id: room.id,
      order: roomOrder(room.id),
      title: room.title,
      intro: room.intro,
      prompt: room.prompt,
      data: room.publicData(session),
      hintsAvailable: room.hints.length,
    }
  }

  async attempt(session: GameSession, roomId: RoomId, answer: unknown): Promise<AttemptResponse> {
    if (!isRoomUnlocked(session, roomId)) throw ApiError.roomLocked()

    const outcome = getRoom(roomId).check(answer, session)
    const updatedSession = outcome.correct
      ? await this.sessions.markSolved(session, roomId)
      : session

    return {
      correct: outcome.correct,
      feedback: outcome.feedback,
      session: updatedSession,
    }
  }

  /**
   * Hints come from the server too, so we can count them. `hintsUsed` is the
   * session total, which is what a scoreboard would rank on.
   */
  async hint(session: GameSession, roomId: RoomId): Promise<HintResponse> {
    if (!isRoomUnlocked(session, roomId)) throw ApiError.roomLocked()

    const { hints } = getRoom(roomId)
    const nextHint = hints[session.hintsUsed]
    if (nextHint === undefined) throw ApiError.noHintsLeft()

    const updatedSession = await this.sessions.recordHintUsed(session)
    return {
      hint: nextHint,
      hintsUsed: updatedSession.hintsUsed,
      hintsRemaining: Math.max(0, hints.length - updatedSession.hintsUsed),
    }
  }
}
