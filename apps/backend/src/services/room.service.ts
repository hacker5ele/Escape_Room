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
      // How many *this player* can still take here, not how many the room has.
      // The name always meant the former; the implementation used to return the
      // latter, so a player who had spent their hints was still told there were
      // three left.
      hintsAvailable: Math.max(0, room.hints.length - hintsTakenIn(session, roomId)),
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
    // where players get stuck. `roomComplete` (defaulting to `correct`) is
    // what actually unlocks the next room — see ADR-0068: a multi-stage room
    // like room-03 has many correct answers before its true final one.
    const roomComplete = outcome.roomComplete ?? outcome.correct
    const updatedSession = await this.games.applyAttempt(
      session,
      roomId,
      answer,
      outcome.correct,
      roomComplete,
      actor,
    )

    return {
      correct: outcome.correct,
      feedback: outcome.feedback,
      session: updatedSession,
    }
  }

  /**
   * Marks a room solved with no answer involved — for a room whose final
   * stage(s) are entirely client-side (ADR-0070). Refuses unless the room's
   * own `canComplete()` agrees the server-checked part is actually done;
   * defaults to always refusing for rooms that don't define it, since only
   * a room with such a stage should ever be finishable this way.
   */
  async complete(session: GameSession, roomId: RoomId, actor?: Actor): Promise<GameSession> {
    if (!isRoomUnlocked(session, roomId)) throw ApiError.roomLocked()

    const room = getRoom(roomId)
    if (!room.canComplete?.(session)) throw ApiError.roomNotReadyToComplete()

    return this.games.completeRoom(session, roomId, actor)
  }

  /**
   * Hints come from the server too, so we can count them. `hintsUsed` is the
   * session total, which is what a scoreboard would rank on.
   */
  async hint(session: GameSession, roomId: RoomId, actor?: Actor): Promise<HintResponse> {
    if (!isRoomUnlocked(session, roomId)) throw ApiError.roomLocked()

    const { hints } = getRoom(roomId)

    // Indexed by hints taken **in this room**, not by `session.hintsUsed` —
    // which counts the whole game. Mixing the two meant a per-room array read
    // with a cross-room counter: after three hints in room one, room two asked
    // for `hints[3]`, found nothing, and reported none left while still
    // offering three. See ADR-0043.
    const taken = hintsTakenIn(session, roomId)
    const nextHint = hints[taken]
    if (nextHint === undefined) throw ApiError.noHintsLeft()

    const updatedSession = await this.games.recordHintUsed(session, roomId, actor)
    return {
      hint: nextHint,
      // Still the whole game: this is what the leaderboard ranks on, and "how
      // many hints did you need" is a question about the game, not the room.
      hintsUsed: updatedSession.hintsUsed,
      hintsRemaining: Math.max(0, hints.length - (taken + 1)),
    }
  }
}

/**
 * How many hints this player has taken in one room.
 *
 * Counted from the activity log, which has recorded `hint_taken` with a
 * `roomId` since ADR-0020 — so the per-room number was already being stored and
 * simply was not being read. That is why this needs no change to the session
 * shape and no migration for games already in progress.
 *
 * The log is capped at `MAX_GAME_EVENTS` (500). A game long enough to push its
 * own hint events off the end would start offering a hint the player has
 * already seen — a repeat, not a leak, and 500 events is far more than four
 * rooms take.
 */
function hintsTakenIn(session: GameSession, roomId: RoomId): number {
  return session.events.filter((event) => event.type === 'hint_taken' && event.roomId === roomId)
    .length
}
