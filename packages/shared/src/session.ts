import { z } from 'zod'
import { roomIdSchema } from './rooms.js'
import { gameEventSchema } from './events.js'

/**
 * A player's progress through the game.
 *
 * One player has exactly one game, keyed on `userId` — the id Clerk gives the
 * signed-in account. The server derives it from the verified request, so there
 * is no client-supplied identifier that could be forged to reach somebody
 * else's game. See ADR-0019.
 *
 * Note what is not here: no `currentRoom` field. Which room the player is in
 * follows from `solvedRooms`, so the two can never contradict each other. Use
 * `currentRoomId()` from `access.ts`.
 */
export const gameSessionSchema = z.object({
  id: z.uuid(),
  /** Clerk user id, e.g. `user_2abc…`. The partition key in DynamoDB. */
  userId: z.string().min(1),
  /** Display name, taken from the Clerk profile rather than a form field. */
  playerName: z.string(),
  /** Rooms the player has solved. Order of entries is not significant. */
  solvedRooms: z.array(roomIdSchema),
  /** ISO 8601 timestamp. */
  startedAt: z.string(),
  /** ISO 8601 timestamp, or null while the game is still running. */
  finishedAt: z.string().nullable(),
  hintsUsed: z.number().int().nonnegative(),
  /**
   * Everything this player has done, oldest first. Defaulted so a game written
   * before the log existed still parses instead of failing the whole read.
   */
  events: z.array(gameEventSchema).default([]),
})

export type GameSession = z.infer<typeof gameSessionSchema>
