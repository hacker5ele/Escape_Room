import { z } from 'zod'
import { publicProfileSchema } from './profiles.js'
import { roomIdSchema } from './rooms.js'

/**
 * Who is standing where, right now.
 *
 * Everything in this file is deliberately **ephemeral**. It lives in memory on
 * the API and is gone when the process restarts, because a position is
 * meaningless a second later and a lobby does not outlive the server. Party
 * membership and progress are durable and stay in DynamoDB, untouched.
 *
 * That is only safe because App Runner is pinned to exactly one instance —
 * `min_size = 1, max_size = 1` in `infra/modules/environment/main.tf`. Raise
 * that and friends will start vanishing for each other, because two instances
 * would each hold half the room. See ADR-0038.
 */

/** The stage's coordinate space. Every position is in these units. */
export const STAGE_WIDTH = 1600
export const STAGE_HEIGHT = 900

/** Where a player may stand. The server clamps to this; it does not trust it. */
export const STAGE_BOUNDS = { minX: 140, maxX: 1460, minY: 690, maxY: 880 } as const

export const EMOTE_NAMES = [
  'wave',
  'dance',
  'jump',
  'spin',
  'cheer',
  'shrug',
  'sit',
  'faint',
] as const

export type EmoteName = (typeof EMOTE_NAMES)[number]

/**
 * The four part ids that draw a character.
 *
 * Sent by the client on every heartbeat and echoed to peers rather than looked
 * up server-side. That is a deliberate trade: it keeps the identity provider's
 * metadata out of the API entirely, works identically in local development
 * where there is no Clerk, and costs nothing to be wrong about — a character is
 * cosmetic, and the receiving client validates it against its own catalogue and
 * falls back if it does not recognise the ids.
 */
export const characterSchema = z.object({
  head: z.string().max(32),
  body: z.string().max(32),
  arm: z.string().max(32),
  leg: z.string().max(32),
})

export type CharacterParts = z.infer<typeof characterSchema>

/** Where the party currently is. The host moves everybody by changing this. */
export const partyPhaseSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('lobby') }),
  z.object({ kind: z.literal('room'), roomId: roomIdSchema }),
])

export type PartyPhase = z.infer<typeof partyPhaseSchema>

export const heartbeatRequestSchema = z.object({
  x: z.number(),
  y: z.number(),
  /** -1 facing left, 1 facing right. */
  facing: z.union([z.literal(1), z.literal(-1)]),
  walking: z.boolean(),
  character: characterSchema,
  ready: z.boolean(),
  /**
   * An emote just started, or null. Sent once rather than held: peers are told
   * when it began and play it from that offset, so a dance looks synchronised
   * even though the message arrived late.
   */
  emote: z.enum(EMOTE_NAMES).nullable(),
})

export type HeartbeatRequest = z.infer<typeof heartbeatRequestSchema>

export const peerSchema = z.object({
  profile: publicProfileSchema,
  x: z.number(),
  y: z.number(),
  facing: z.union([z.literal(1), z.literal(-1)]),
  walking: z.boolean(),
  character: characterSchema,
  ready: z.boolean(),
  isHost: z.boolean(),
  /** The emote they are playing, and when it started, so it can be joined mid-way. */
  emote: z.enum(EMOTE_NAMES).nullable(),
  emoteStartedAt: z.string().nullable(),
  /**
   * Nobody has heard from them for a while. Shown faded rather than removed —
   * somebody who checked their email should not vanish from the room.
   */
  away: z.boolean(),
})

export type Peer = z.infer<typeof peerSchema>

export const heartbeatResponseSchema = z.object({
  /** The server's clock, so a client with a wrong one still times emotes right. */
  now: z.string(),
  /** Everybody else in this party. Empty when playing alone. */
  peers: z.array(peerSchema),
  /** Where the party is. A guest follows the host into a room by reading this. */
  phase: partyPhaseSchema,
  /** True when the caller is the host, which decides who sees PLAY. */
  isHost: z.boolean(),
})

export type HeartbeatResponse = z.infer<typeof heartbeatResponseSchema>

/** Most people are in a party of one, and four is a room rather than a crowd. */
export const MAX_PARTY_SIZE = 4

/** Silent for this long and you are shown as away; for `PRESENCE_TTL_MS` and you are gone. */
export const PRESENCE_AWAY_MS = 10_000
export const PRESENCE_TTL_MS = 120_000
