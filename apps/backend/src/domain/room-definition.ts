import type { GameSession, RoomId } from '@escape-room/shared'

export interface AttemptOutcome {
  correct: boolean
  /** Optional nudge shown to the player. Never reveal the answer here. */
  feedback?: string
  /**
   * Whether this correct answer finishes the ROOM, not just this attempt.
   *
   * Defaults to `correct` when omitted — true for every single-stage room
   * (rooms 1, 2, 4: one correct answer IS the room finished). A multi-stage
   * room whose later stages are still server-checked answers must set this
   * explicitly to `false` on every correct answer except its true final
   * one, or GameService.applyAttempt marks the whole room — and therefore
   * every room after it — unlocked after the very first riddle. See
   * ADR-0068. Room 3's later stages (Atlantis, the Olympus carpet race) are
   * entirely client-side and never reach `check()` at all — see
   * `canComplete` below and ADR-0070.
   */
  roomComplete?: boolean
}

/**
 * One room of the escape room.
 *
 * Each sub-team owns exactly one file implementing this interface, plus the
 * matching folder in the frontend. See ADR-0007.
 *
 * The `order` is not a field here — it comes from the position of the room in
 * `ROOM_IDS` in the shared package, so it cannot get out of step.
 */
export interface RoomDefinition {
  id: RoomId
  title: string
  /** Atmosphere: what the player sees on entering. */
  intro: string
  /** What the player is actually asked to do. */
  prompt: string
  /** Shown one at a time, in order, when the player asks for help. */
  hints: readonly string[]

  /**
   * The data the browser needs to render the puzzle.
   *
   * MUST NOT contain the solution, or anything the solution can be trivially
   * derived from. Everything returned here ends up in the browser, where the
   * player can read it. A test enforces this for every room.
   */
  publicData(session: GameSession): Record<string, unknown>

  /**
   * The only place the answer is known. Runs on the server, never shipped to
   * the browser. `answer` is whatever the client sent — treat it as hostile
   * and narrow it yourself.
   */
  check(answer: unknown, session: GameSession): AttemptOutcome

  /**
   * Whether `POST /api/rooms/:roomId/complete` (ADR-0070) is allowed to
   * mark this room solved right now, given everything server-checked about
   * it is already done. Rooms with no client-only tail stage after their
   * last `check()` never need this — it defaults to `false` when omitted,
   * since only a room that actually has such a stage should ever expose a
   * way to finish outside of `check()` at all.
   */
  canComplete?(session: GameSession): boolean
}
