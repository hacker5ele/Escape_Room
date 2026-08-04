import type { Friend, FriendListResponse } from '@escape-room/shared'
import type {
  FriendshipEdge,
  FriendshipRepository,
} from '../repositories/friendship.repository.js'
import type { ProfileService } from './profile.service.js'
import type { NotificationService } from './notification.service.js'
import { ApiError } from '../http/api-error.js'

export class FriendService {
  constructor(
    private readonly repository: FriendshipRepository,
    private readonly profiles: ProfileService,
    /**
     * Optional so the friend logic can be tested without standing up
     * notifications, and so a missing one degrades to silence rather than an
     * error.
     */
    private readonly notifications?: NotificationService,
  ) {}

  /**
   * Everything about a player's relationships, in one query, with the other
   * person's profile attached so the caller can render faces without a second
   * round trip.
   *
   * Blocked edges are filtered out rather than returned — the blocker does not
   * want to see them in a friend list, and there is nothing actionable there.
   */
  async list(userId: string): Promise<FriendListResponse> {
    const edges = (await this.repository.listFor(userId)).filter(
      (edge) => edge.status !== 'blocked',
    )

    const profiles = await this.profiles.mapOf(edges.map((edge) => edge.otherUserId))

    const build = (status: FriendshipEdge['status']): Friend[] =>
      edges
        .filter((edge) => edge.status === status)
        .flatMap((edge) => {
          const profile = profiles.get(edge.otherUserId)
          // A missing profile means somebody who has not signed in since
          // profiles existed. Skipping is better than rendering a blank row.
          return profile ? [{ profile, status: edge.status, since: edge.since }] : []
        })
        .sort((a, b) => b.since.localeCompare(a.since))

    return {
      friends: build('accepted'),
      incoming: build('pending_in'),
      outgoing: build('pending_out'),
    }
  }

  /**
   * Asks somebody to be friends.
   *
   * Handles the case that trips people up: if they have *already* asked you,
   * this is an acceptance rather than a second request. Without that, two
   * people who ask each other at the same time both sit staring at an outgoing
   * request that neither can resolve.
   */
  async request(userId: string, targetUserId: string): Promise<FriendListResponse> {
    if (userId === targetUserId) {
      throw new ApiError(400, 'CANNOT_FRIEND_SELF', 'You are already your own best friend.')
    }

    const [mine, theirs] = await Promise.all([
      this.repository.find(userId, targetUserId),
      this.repository.find(targetUserId, userId),
    ])

    // Their block is invisible to the requester on purpose: a blocked person
    // who is told they are blocked simply makes another account. From their
    // side this looks exactly like a request that was never answered.
    if (theirs?.status === 'blocked') {
      // Write only our own side. Touching theirs would overwrite the `blocked`
      // edge and quietly undo the block — a request would become a way out of
      // being blocked, which is exactly backwards.
      await this.repository.putOne({
        userId,
        otherUserId: targetUserId,
        status: 'pending_out',
        since: new Date().toISOString(),
      })
      // Deliberately no notification. The whole point of the block is that they
      // are not told, and the blocker is not disturbed.
      return this.list(userId)
    }

    if (mine?.status === 'blocked') {
      throw new ApiError(409, 'BLOCKED', 'Unblock them first.')
    }
    if (mine?.status === 'accepted') {
      throw new ApiError(409, 'ALREADY_FRIENDS', 'You are already friends.')
    }

    // They asked first — treat this as saying yes.
    if (mine?.status === 'pending_in') {
      await this.#writePair(userId, targetUserId, 'accepted', 'accepted')
      await this.#tell(targetUserId, userId, 'friend_accepted', (who) => `${who} is now your friend.`)
      return this.list(userId)
    }

    await this.#writePair(userId, targetUserId, 'pending_out', 'pending_in')
    await this.#tell(
      targetUserId,
      userId,
      'friend_request',
      (who) => `${who} wants to be your friend.`,
    )
    return this.list(userId)
  }

  /**
   * Becomes friends by following an invite link.
   *
   * Unlike `request`, this is immediately mutual. The link *is* the inviter's
   * consent — they created it and sent it — so asking them to approve the
   * person who used it makes them confirm the same thing twice, and leaves the
   * visitor staring at a screen that looks like nothing happened.
   *
   * A block still wins: it is checked exactly as it is for an ordinary request,
   * because an invite link somebody was sent before being blocked must not be a
   * way back in.
   */
  async acceptInvite(userId: string, inviterUserId: string): Promise<FriendListResponse> {
    if (userId === inviterUserId) {
      throw new ApiError(400, 'CANNOT_FRIEND_SELF', 'That is your own invite link.')
    }

    const [mine, theirs] = await Promise.all([
      this.repository.find(userId, inviterUserId),
      this.repository.find(inviterUserId, userId),
    ])

    // Same silence as `request`: they are told nothing, and the block holds.
    if (theirs?.status === 'blocked') {
      await this.repository.putOne({
        userId,
        otherUserId: inviterUserId,
        status: 'pending_out',
        since: new Date().toISOString(),
      })
      return this.list(userId)
    }

    if (mine?.status === 'blocked') {
      throw new ApiError(409, 'BLOCKED', 'Unblock them first.')
    }
    if (mine?.status === 'accepted') {
      throw new ApiError(409, 'ALREADY_FRIENDS', 'You are already friends.')
    }

    await this.#writePair(userId, inviterUserId, 'accepted', 'accepted')
    await this.#tell(
      inviterUserId,
      userId,
      'friend_accepted',
      (who) => `${who} joined through your invite link.`,
    )
    return this.list(userId)
  }

  async accept(userId: string, requesterUserId: string): Promise<FriendListResponse> {
    const mine = await this.repository.find(userId, requesterUserId)
    if (mine?.status !== 'pending_in') {
      throw new ApiError(404, 'PROFILE_NOT_FOUND', 'There is no request from them to accept.')
    }

    await this.#writePair(userId, requesterUserId, 'accepted', 'accepted')
    // Only the person who was waiting hears about it. Being turned down is not
    // announced — there is nothing to do about it, and saying so is unkind.
    await this.#tell(
      requesterUserId,
      userId,
      'friend_accepted',
      (who) => `${who} accepted your friend request.`,
    )
    return this.list(userId)
  }

  /** Turning somebody down, and unfriending, are the same operation. */
  async remove(userId: string, otherUserId: string): Promise<FriendListResponse> {
    await this.repository.deletePair(userId, otherUserId)
    return this.list(userId)
  }

  /**
   * Stops somebody reaching you at all.
   *
   * Keeps an edge on the blocker's side so future requests are refused, and
   * deletes the blocked person's edge entirely so they are told nothing and
   * lose any friendship they had. Chat reads check friendship, so blocking also
   * closes the conversation.
   */
  async block(userId: string, otherUserId: string): Promise<FriendListResponse> {
    if (userId === otherUserId) {
      throw new ApiError(400, 'CANNOT_FRIEND_SELF', 'You cannot block yourself.')
    }

    await this.repository.block(
      { userId, otherUserId, status: 'blocked', since: new Date().toISOString() },
      otherUserId,
    )
    return this.list(userId)
  }

  async unblock(userId: string, otherUserId: string): Promise<FriendListResponse> {
    const mine = await this.repository.find(userId, otherUserId)
    if (mine?.status === 'blocked') {
      await this.repository.deletePair(userId, otherUserId)
    }
    return this.list(userId)
  }

  /** True only for a mutual, accepted friendship. Chat and co-op both gate on this. */
  async areFriends(userId: string, otherUserId: string): Promise<boolean> {
    const mine = await this.repository.find(userId, otherUserId)
    return mine?.status === 'accepted'
  }

  /**
   * Tells `recipient` that `actor` did something.
   *
   * The actor's name is looked up here rather than passed in, so the message
   * says who it was even when the caller only had an id. A missing profile
   * falls back to something neutral rather than skipping the notification.
   */
  async #tell(
    recipientUserId: string,
    actorUserId: string,
    type: 'friend_request' | 'friend_accepted',
    compose: (who: string) => string,
  ): Promise<void> {
    if (!this.notifications) return

    const actor = await this.profiles.findByUserId(actorUserId)
    await this.notifications.notifyQuietly(
      recipientUserId,
      type,
      compose(actor?.displayName || actor?.username || 'Somebody'),
      actorUserId,
    )
  }

  async #writePair(
    userId: string,
    otherUserId: string,
    mine: FriendshipEdge['status'],
    theirs: FriendshipEdge['status'],
  ): Promise<void> {
    const since = new Date().toISOString()
    await this.repository.putPair(
      { userId, otherUserId, status: mine, since },
      { userId: otherUserId, otherUserId: userId, status: theirs, since },
    )
  }
}
