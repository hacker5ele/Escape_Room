import type { GameSession, RoomId } from '@escape-room/shared'

export interface AttemptOutcome {
  correct: boolean
  /** Optional nudge shown to the player. Never reveal the answer here. */
  feedback?: string
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
}
