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
import type { Actor, GameService } from './game.service.js'

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

  async attempt(
    session: GameSession,
    roomId: RoomId,
    answer: unknown,
    actor?: Actor,
  ): Promise<AttemptResponse> {
    if (!isRoomUnlocked(session, roomId)) throw ApiError.roomLocked()

    const outcome = getRoom(roomId).check(answer, session)

    // Every attempt is logged, right or wrong — the wrong ones are what show
    // where players get stuck.
    const updatedSession = await this.games.applyAttempt(
      session,
      roomId,
      answer,
      outcome.correct,
      actor,
    )

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
  async hint(session: GameSession, roomId: RoomId, actor?: Actor): Promise<HintResponse> {
    if (!isRoomUnlocked(session, roomId)) throw ApiError.roomLocked()

    const { hints } = getRoom(roomId)
    const nextHint = hints[session.hintsUsed]
    if (nextHint === undefined) throw ApiError.noHintsLeft()

    const updatedSession = await this.games.recordHintUsed(session, roomId, actor)
    return {
      hint: nextHint,
      hintsUsed: updatedSession.hintsUsed,
      hintsRemaining: Math.max(0, hints.length - updatedSession.hintsUsed),
    }
  }
}
