import { z } from 'zod'
import { roomIdSchema } from './rooms.js'

/**
 * The player's progress through the game.
 *
 * Note what is *not* here: there is no `currentRoom` field. Which room the
 * player is in follows from `solvedRooms`, and deriving it means the two can
 * never contradict each other. Use `currentRoomId()` from `access.ts`.
 *
 * This object lives on the server. The browser holds only the session id.
 */
export const gameSessionSchema = z.object({
  id: z.uuid(),
  playerName: z.string(),
  /** Rooms the player has solved. Order of entries is not significant. */
  solvedRooms: z.array(roomIdSchema),
  /** ISO 8601 timestamp. */
  startedAt: z.string(),
  /** ISO 8601 timestamp, or null while the game is still running. */
  finishedAt: z.string().nullable(),
  hintsUsed: z.number().int().nonnegative(),
})

export type GameSession = z.infer<typeof gameSessionSchema>

export const PLAYER_NAME_MAX_LENGTH = 32
