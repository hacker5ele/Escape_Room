import { z } from 'zod'
import { publicProfileSchema } from './profiles.js'

/**
 * One player's standing among their friends.
 *
 * Everything here is already recorded by the game — solved rooms, hints and the
 * activity log. The leaderboard reads it rather than tracking anything new, so
 * there is no second source of truth to drift.
 */
export const leaderboardEntrySchema = z.object({
  profile: publicProfileSchema,
  /**
   * Position on the board, counting from one.
   *
   * Sent rather than inferred from the array index, because on the global board
   * the two are not the same: it returns the top ten *plus your own row*, so an
   * eleventh entry may be the player in twenty-third place. Counting positions
   * client-side would put a confident, wrong number next to their name.
   */
  rank: z.number().int().positive(),
  solvedRooms: z.number().int().nonnegative(),
  hintsUsed: z.number().int().nonnegative(),
  /** Milliseconds from starting to finishing, or null while still playing. */
  finishedInMs: z.number().int().nonnegative().nullable(),
  /** True for the person asking, so the client can pick their own row out. */
  isMe: z.boolean(),
})

export type LeaderboardEntry = z.infer<typeof leaderboardEntrySchema>

export const leaderboardResponseSchema = z.object({
  entries: z.array(leaderboardEntrySchema),
})

export type LeaderboardResponse = z.infer<typeof leaderboardResponseSchema>
