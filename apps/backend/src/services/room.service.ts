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
import type { GameService } from './game.service.js'

export class RoomService {
  constructor(private readonly games: GameService) {}

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

    // Every attempt is logged, right or wrong — the wrong ones are what show
    // where players get stuck. `roomComplete` (defaulting to `correct`) is
    // what actually unlocks the next room — see ADR-0025: a multi-stage room
    // like room-03 has many correct answers before its true final one.
    const roomComplete = outcome.roomComplete ?? outcome.correct
    const updatedSession = await this.games.applyAttempt(session, roomId, answer, outcome.correct, roomComplete)

    return {
      correct: outcome.correct,
      feedback: outcome.feedback,
      session: updatedSession,
    }
  }

  /**
   * Marks a room solved with no answer involved — for a room whose final
   * stage(s) are entirely client-side (ADR-0027). Refuses unless the room's
   * own `canComplete()` agrees the server-checked part is actually done;
   * defaults to always refusing for rooms that don't define it, since only
   * a room with such a stage should ever be finishable this way.
   */
  async complete(session: GameSession, roomId: RoomId): Promise<GameSession> {
    if (!isRoomUnlocked(session, roomId)) throw ApiError.roomLocked()

    const room = getRoom(roomId)
    if (!room.canComplete?.(session)) throw ApiError.roomNotReadyToComplete()

    return this.games.completeRoom(session, roomId)
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

    const updatedSession = await this.games.recordHintUsed(session, roomId)
    return {
      hint: nextHint,
      hintsUsed: updatedSession.hintsUsed,
      hintsRemaining: Math.max(0, hints.length - updatedSession.hintsUsed),
    }
  }
}
