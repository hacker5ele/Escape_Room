import { z } from 'zod'
import { roomIdSchema } from './rooms.js'

/**
 * Everything a player does, recorded against their account.
 *
 * The log is append-only and lives on the game record, so reading a player's
 * whole history is the same single DynamoDB lookup that reads their progress —
 * no second table and no query.
 *
 * It is deliberately more than the UI needs today. It is what makes a
 * leaderboard, per-room timings and "what actually happened" possible later,
 * and on Thursday it is the difference between "it broke" and knowing which
 * answer on which room broke it.
 */
export const GAME_EVENT_TYPES = [
  'game_started',
  'room_entered',
  'attempt',
  'hint_taken',
  'room_solved',
  'game_completed',
] as const

export type GameEventType = (typeof GAME_EVENT_TYPES)[number]

export const gameEventSchema = z.object({
  /** ISO 8601 timestamp. */
  at: z.string(),
  type: z.enum(GAME_EVENT_TYPES),
  /** Absent on whole-game events like `game_started`. */
  roomId: roomIdSchema.optional(),
  /** True or false on `attempt`; absent otherwise. */
  correct: z.boolean().optional(),
  /**
   * What the player typed, on `attempt`. Their own answer, so there is nothing
   * sensitive here — and it is what makes "why did they get stuck" answerable.
   * Truncated server-side, because this is untrusted input.
   */
  answer: z.string().optional(),
  /**
   * Who did it. Absent on a solo game, where the answer is always "the owner".
   *
   * Present once a game is shared, so the log reads as a shared history —
   * "Ada solved room 2" rather than "room 2 was solved".
   */
  actorUserId: z.string().optional(),
  /** The actor's display name at the time, so the log renders without a lookup. */
  actorName: z.string().optional(),
})

export type GameEvent = z.infer<typeof gameEventSchema>

/**
 * How many events are kept.
 *
 * A DynamoDB item cannot exceed 400 KB, and the log shares an item with the
 * game. At roughly 120 bytes an event, 500 is far inside that while being far
 * more than a play-through produces. Oldest are dropped first.
 */
export const MAX_GAME_EVENTS = 500

/** Longest answer stored in the log. Answers are player input, so they are capped. */
export const MAX_LOGGED_ANSWER_LENGTH = 120
