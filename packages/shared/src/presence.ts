import { z } from 'zod'
import { publicProfileSchema } from './profiles.js'
import { roomIdSchema } from './rooms.js'

/**
 * Who is standing where, right now.
 *
 * Everything in this file is deliberately **ephemeral**. It lives in memory on
 * the API and is gone when the process restarts, because a position is
 * meaningless a second later and a lobby does not outlive the server.
 *
 * Since ADR-0045 that includes **who is playing with whom**. Being in a party
 * is not a row somebody has to remember to delete; it is a claim you keep alive
 * by beating, and it ends when you stop. Progress is the durable half and stays
 * in DynamoDB, untouched.
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

/**
 * "I still have the game open."
 *
 * The whole of a player's claim on a party. Sent from every screen, not just
 * the stage — you can be in a friend's game while reading the leaderboard, and
 * a claim nobody is renewing is a claim that has ended.
 */
export const aliveRequestSchema = z.object({
  /**
   * The tab is in the background.
   *
   * A closed tab and a *throttled* tab look identical from the server: Chrome
   * clamps timers in tabs hidden for more than five minutes to roughly one a
   * minute. The client is the only one that can tell the difference, so it
   * says which it is and the server picks its patience accordingly.
   */
  hidden: z.boolean(),
})

export type AliveRequest = z.infer<typeof aliveRequestSchema>

export const heartbeatRequestSchema = z.object({
  x: z.number(),
  y: z.number(),
  /** -1 facing left, 1 facing right. */
  facing: z.union([z.literal(1), z.literal(-1)]),
  walking: z.boolean(),
  character: characterSchema,
  ready: z.boolean(),
  /** Same meaning as on `aliveRequestSchema` — a heartbeat is an alive beat that also has a position. */
  hidden: z.boolean(),
  /**
   * Stations this player has acted on since the last beat, oldest first.
   *
   * An *event*, consumed by the beat that carries it: pressing E is a thing you
   * did once, not a state you are in.
   *
   * A room used to derive this from where somebody was standing, and that was
   * the right call while standing *was* the input — deriving a fact costs
   * nothing and leaves nothing to forge. Acting is now a choice, and a choice
   * cannot be derived from a position, so it has to be sent. It is still
   * **verified**: a station named from the other end of the room, or one this
   * player is nowhere near, is ignored.
   *
   * **Defaulted rather than required**, and that is not politeness. This beat
   * goes out twice a second from every open tab, so the moment a deploy lands
   * every player who has not reloaded is running the previous script. Required
   * fields would 400 all of them until they did, and vanishing out of your
   * friends' lobby is a strange way to find out a release happened. An old
   * client simply never acts, which is exactly right.
   */
  acted: z.array(z.string().max(32)).max(8).default([]),
  /**
   * The station this player is holding onto, or null.
   *
   * *State*, unlike `acted` — a wheel is turned for as long as somebody has
   * hold of it, so this is re-sent on every beat and stored, which is what lets
   * everybody else in the room see it turning.
   */
  holding: z.string().max(32).nullable().default(null),
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

/**
 * A room that is happening rather than waiting to be answered.
 *
 * Most rooms are a question and a box: the browser has everything it needs the
 * moment it enters, and nothing changes until somebody submits. A room with a
 * clock in it is not like that — the water rises whether anybody types or not,
 * and both players have to be looking at the *same* water or co-operating about
 * it is meaningless.
 *
 * So it rides the heartbeat rather than taking an endpoint of its own. That is
 * the rule `presence.routes.ts` already states — split when the cadences
 * differ, share when they match — and a room that changes twice a second wants
 * exactly the cadence presence already runs at.
 */
export const liveRoomSchema = z.object({
  roomId: roomIdSchema,
  /**
   * How high the water is: 0 dry, 100 over everybody's head.
   *
   * The clock, the enemy and the gate in one number, which is why the room
   * needs no separate countdown widget.
   */
  depth: z.number(),
  /** Which way it is going right now, so the room can say so without doing arithmetic. */
  trend: z.enum(['rising', 'holding', 'falling']),
  /** Which act the hall is in, 1-based. */
  act: z.number().int().nonnegative(),
  /**
   * How many players the room counts.
   *
   * Mechanisms change shape on this: what one person can work alone, two people
   * have to work together. Locked while an act is running so nothing changes
   * under somebody's hands.
   */
  counted: z.number().int().nonnegative(),
  /** Everybody went under. The shell plays the splash and takes the party back to the lobby. */
  drowned: z.boolean(),
  /**
   * Whatever the current act needs drawn — lamps lit, tablets placed, which
   * way the far wheel wants turning.
   *
   * A record rather than a union of every act, for the same reason
   * `RoomPublicData.data` is one: it is the seam that lets a room own its own
   * shape. Rooms 02 to 04 can grow a clock of their own without touching this
   * package again, which is what ADR-0007 promised sub-teams. Narrow it inside
   * the room, not here.
   */
  detail: z.record(z.string(), z.unknown()),
})

export type LiveRoom = z.infer<typeof liveRoomSchema>

export const heartbeatResponseSchema = z.object({
  /** The server's clock, so a client with a wrong one still times emotes right. */
  now: z.string(),
  /** Everybody else in this party. Empty when playing alone. */
  peers: z.array(peerSchema),
  /** Where the party is. A guest follows the host into a room by reading this. */
  phase: partyPhaseSchema,
  /** True when the caller is the host, which decides who sees PLAY. */
  isHost: z.boolean(),
  /** The room's own state, when the party is standing in one that has a clock. */
  room: liveRoomSchema.nullable(),
  /**
   * How many times the party's game has been written.
   *
   * **One integer that makes every room multiplayer.** Progress has been shared
   * since ADR-0028 — a guest's solves go to the host's game — but you only ever
   * found out about it when *you* made a request, so a partner could finish a
   * room and your screen would sit there unchanged. Watching this number is
   * enough: when it moves, re-read the session, and their solve, their hint and
   * their wrong answer all arrive on your screen within half a second.
   *
   * A version rather than the game itself, because this beat runs twice a
   * second per player and the answer is almost always "nothing happened".
   *
   * **Defaulted**, so a client that arrives before the API has redeployed sees
   * 0 and simply never refetches, rather than failing to parse every beat and
   * losing presence entirely.
   */
  version: z.number().int().nonnegative().default(0),
})

export type HeartbeatResponse = z.infer<typeof heartbeatResponseSchema>

/** Most people are in a party of one, and four is a room rather than a crowd. */
export const MAX_PARTY_SIZE = 4

/** How often a player says they are still here from somewhere other than the stage. */
export const LIVENESS_BEAT_MS = 5_000

/** Silent for this long and you are shown faded, but you have not gone anywhere. */
export const PRESENCE_AWAY_MS = 10_000

/**
 * Silent for this long and you have left — the lobby *and* the game.
 *
 * There is no separate record of who is in which party. Being in one is a claim
 * you keep alive by beating, so these two numbers are the only thing that
 * decides whether somebody is still playing. See ADR-0045.
 *
 * **Visible**: three missed beats. You were looking at the tab and now it is
 * silent, so you closed it — the case that has to be quick.
 *
 * **Hidden**: the browser is throttling the beat and we cannot tell a
 * backgrounded tab from a closed one, so we wait long enough that looking at
 * something else does not throw you out of your friend's game.
 */
export const PRESENCE_TTL_VISIBLE_MS = LIVENESS_BEAT_MS * 3
export const PRESENCE_TTL_HIDDEN_MS = 300_000
