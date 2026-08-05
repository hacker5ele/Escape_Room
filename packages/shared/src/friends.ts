import { z } from 'zod'
import { publicProfileSchema } from './profiles.js'

/**
 * How two players stand relative to each other.
 *
 * Stored on *both* sides of the pair, so "list my friends" is a single query
 * rather than a query plus a scan of the reverse direction. The two rows are
 * mirror images: if A sees `pending_out`, B sees `pending_in`.
 *
 * `blocked` is deliberately one-sided. If A blocks B, only A's row says so —
 * B's row is deleted entirely, so B is told nothing and simply cannot get back
 * in. Telling somebody they have been blocked is an invitation to make another
 * account.
 */
export const FRIENDSHIP_STATUSES = ['pending_out', 'pending_in', 'accepted', 'blocked'] as const

export type FriendshipStatus = (typeof FRIENDSHIP_STATUSES)[number]

export const friendshipStatusSchema = z.enum(FRIENDSHIP_STATUSES)

/** A friendship as the API reports it: the other person, plus where things stand. */
export const friendSchema = z.object({
  profile: publicProfileSchema,
  status: friendshipStatusSchema,
  /** ISO 8601, when this edge last changed. Orders the request list. */
  since: z.string(),
})

export type Friend = z.infer<typeof friendSchema>

export const friendListResponseSchema = z.object({
  /** Mutual friends. */
  friends: z.array(friendSchema),
  /** People who have asked to be your friend and are waiting on you. */
  incoming: z.array(friendSchema),
  /** People you have asked, who have not answered yet. */
  outgoing: z.array(friendSchema),
})

export type FriendListResponse = z.infer<typeof friendListResponseSchema>

/**
 * An invite link, as its owner sees it.
 *
 * The token is included because the owner needs it to share the link. It is
 * never included in the *public* preview a visitor sees — that returns only the
 * inviter's profile.
 */
export const inviteSchema = z.object({
  token: z.string(),
  createdAt: z.string(),
  /** ISO 8601, or null for a link that does not expire. */
  expiresAt: z.string().nullable(),
  /** How many people have joined through it. */
  useCount: z.number().int().nonnegative(),
  /**
   * True for a link minted from the lobby.
   *
   * Following one befriends you *and* puts you in the party, so it is a "come
   * and play now" link rather than a "let us be friends" link. Kept as a flag
   * on the same record rather than a second kind of token: the expiry, the
   * revocation and the public preview all already work, and none of that is
   * worth building twice.
   */
  forParty: z.boolean(),
})

export type Invite = z.infer<typeof inviteSchema>

/**
 * What somebody sees when they open an invite link, before signing in.
 *
 * Only the inviter's public profile. Notably absent: how many people have used
 * it, when it was made, who else is in their friend list — none of which a
 * stranger holding a link needs to decide whether to accept.
 */
export const invitePreviewSchema = z.object({
  inviter: publicProfileSchema,
  /**
   * Set when the link came from a lobby, so the page can say *"Alice wants you
   * to play"* rather than *"Alice wants to be your friend"* — which is a
   * different question and deserves a different button.
   *
   * Deliberately just a count. Who else is in the party is not something a
   * stranger holding a link needs before deciding.
   */
  party: z
    .object({
      /** People already in it, host included. */
      size: z.number().int().positive(),
      full: z.boolean(),
    })
    .nullable(),
})

export type InvitePreview = z.infer<typeof invitePreviewSchema>

/** `forParty` mints a link that also puts the visitor in your game. */
export const createInviteRequestSchema = z.object({
  forParty: z.boolean().optional(),
})

export type CreateInviteRequest = z.infer<typeof createInviteRequestSchema>

export const inviteListResponseSchema = z.object({ invites: z.array(inviteSchema) })
export type InviteListResponse = z.infer<typeof inviteListResponseSchema>
