import { Router, type RequestHandler } from 'express'
import { z } from 'zod'
import { createInviteRequestSchema } from '@escape-room/shared'
import type {
  FriendListResponse,
  Invite,
  InviteListResponse,
  InvitePreview,
} from '@escape-room/shared'
import type { FriendService } from '../services/friend.service.js'
import type { InviteService } from '../services/invite.service.js'
import type { ProfileService } from '../services/profile.service.js'
import type { Authenticator } from '../http/authenticator.js'
import { requireUserId } from '../http/require-auth.js'
import type { PartyService } from '../services/party.service.js'
import { ApiError } from '../http/api-error.js'

const byUsernameSchema = z.object({ username: z.string().trim().min(1).max(64) })

export function createFriendRoutes(
  friends: FriendService,
  profiles: ProfileService,
  authenticator: Authenticator,
  writeRateLimiter: RequestHandler,
): Router {
  const router = Router()

  /** Resolves `:userId` from the path, rejecting anything absurd early. */
  const readUserId = (raw: unknown): string => {
    if (typeof raw !== 'string' || raw.length === 0 || raw.length > 128) {
      throw ApiError.validation('Not a valid user id.')
    }
    return raw
  }

  // GET /api/friends — friends, incoming requests and outgoing requests, each
  // with the other person's profile attached so faces render without a second
  // round trip.
  router.get('/', async (req, res) => {
    const userId = await requireUserId(req, authenticator)
    const body: FriendListResponse = await friends.list(userId)
    res.json(body)
  })

  // POST /api/friends/by-username — the "add a friend" box.
  router.post('/by-username', writeRateLimiter, async (req, res) => {
    const userId = await requireUserId(req, authenticator)

    const parsed = byUsernameSchema.safeParse(req.body)
    if (!parsed.success) throw ApiError.validation('Give a username.')

    const target = await profiles.findByUsername(parsed.data.username)
    if (!target) {
      // The username index is eventually consistent, so somebody who signed up
      // seconds ago may genuinely not be findable yet. Say so rather than
      // flatly denying they exist.
      throw new ApiError(
        404,
        'PROFILE_NOT_FOUND',
        `Nobody here is called "${parsed.data.username}". If they only just signed up, try again in a moment.`,
      )
    }

    const body: FriendListResponse = await friends.request(userId, target.userId)
    res.status(201).json(body)
  })

  // POST /api/friends/:userId/accept
  router.post('/:userId/accept', writeRateLimiter, async (req, res) => {
    const userId = await requireUserId(req, authenticator)
    const body: FriendListResponse = await friends.accept(userId, readUserId(req.params.userId))
    res.json(body)
  })

  // DELETE /api/friends/:userId — rejecting a request and unfriending are the
  // same operation, so they are the same endpoint.
  router.delete('/:userId', writeRateLimiter, async (req, res) => {
    const userId = await requireUserId(req, authenticator)
    const body: FriendListResponse = await friends.remove(userId, readUserId(req.params.userId))
    res.json(body)
  })

  router.post('/:userId/block', writeRateLimiter, async (req, res) => {
    const userId = await requireUserId(req, authenticator)
    const body: FriendListResponse = await friends.block(userId, readUserId(req.params.userId))
    res.json(body)
  })

  router.post('/:userId/unblock', writeRateLimiter, async (req, res) => {
    const userId = await requireUserId(req, authenticator)
    const body: FriendListResponse = await friends.unblock(userId, readUserId(req.params.userId))
    res.json(body)
  })

  return router
}

export function createInviteRoutes(
  invites: InviteService,
  friends: FriendService,
  authenticator: Authenticator,
  writeRateLimiter: RequestHandler,
  previewRateLimiter: RequestHandler,
  /** Only needed for links that join a party; the friend half works without it. */
  party?: PartyService,
): Router {
  const router = Router()

  // GET /api/invites/:token — PUBLIC, deliberately.
  //
  // The whole point of a link is that it works before you have an account: you
  // see who is inviting you, then decide whether to sign up. It returns only
  // the inviter's public profile — not who else has joined, not when the link
  // was made, not how many times it has been used.
  //
  // Rate limited harder than anything else here, because it is the only
  // unauthenticated endpoint that reads the database.
  router.get('/:token', previewRateLimiter, async (req, res) => {
    const token = typeof req.params.token === 'string' ? req.params.token : ''
    const body: InvitePreview = await invites.preview(token)
    res.json(body)
  })

  // POST /api/invites — mint a link.
  //
  // `forParty` makes it a "come and play now" link: following it befriends you
  // *and* puts you in the minter's game, rather than only the first.
  router.post('/', writeRateLimiter, async (req, res) => {
    const userId = await requireUserId(req, authenticator)
    const parsed = createInviteRequestSchema.safeParse(req.body ?? {})
    if (!parsed.success) throw ApiError.validation('That is not a valid invite.')

    const body: { invite: Invite } = {
      invite: await invites.create(userId, { forParty: parsed.data.forParty }),
    }
    res.status(201).json(body)
  })

  // GET /api/invites — my active links, so they can be shared or revoked.
  router.get('/', async (req, res) => {
    const userId = await requireUserId(req, authenticator)
    const body: InviteListResponse = { invites: await invites.listFor(userId) }
    res.json(body)
  })

  // DELETE /api/invites/:token — revoke.
  router.delete('/:token', writeRateLimiter, async (req, res) => {
    const userId = await requireUserId(req, authenticator)
    const token = typeof req.params.token === 'string' ? req.params.token : ''
    await invites.revoke(token, userId)
    res.status(204).end()
  })

  // POST /api/invites/:token/accept — become friends with whoever made it.
  router.post('/:token/accept', writeRateLimiter, async (req, res) => {
    const userId = await requireUserId(req, authenticator)
    const token = typeof req.params.token === 'string' ? req.params.token : ''

    const { inviterUserId, partyHostUserId } = await invites.accept(token)
    // Opening your own link is a mistake, not an attack — say so plainly
    // rather than creating a self-friendship.
    if (inviterUserId === userId) {
      throw new ApiError(400, 'CANNOT_FRIEND_SELF', 'That is your own invite link.')
    }

    // Mutual straight away rather than a request the inviter has to approve —
    // sending the link was the approval.
    const body: FriendListResponse = await friends.acceptInvite(userId, inviterUserId)

    // And then into their game, if that is what the link was for. Deliberately
    // best-effort: the party may have filled up or the host may have left since
    // the link was sent, and neither is a reason to undo a friendship that was
    // just made. The visitor lands in their own lobby instead.
    if (partyHostUserId) {
      await party?.join(userId, partyHostUserId).catch(() => undefined)
    }

    res.status(201).json(body)
  })

  return router
}
