import { z } from 'zod'
import { publicProfileSchema } from './profiles.js'

/**
 * Who is playing this game.
 *
 * A party is always at least one person — playing alone is a party of one, so
 * there is no separate solo case anywhere above the repository. See ADR-0028.
 */
export const partySchema = z.object({
  /** Whose game everybody is playing. */
  host: publicProfileSchema,
  /** Everybody else in it. Empty when playing alone. */
  members: z.array(publicProfileSchema),
  /** True when the caller is the host, which decides what the UI offers. */
  isHost: z.boolean(),
})

export type Party = z.infer<typeof partySchema>

export const partyResponseSchema = z.object({ party: partySchema })
export type PartyResponse = z.infer<typeof partyResponseSchema>
