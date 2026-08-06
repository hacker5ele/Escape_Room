import { MAX_PARTY_SIZE, type Party, type PublicProfile } from '@escape-room/shared'
import type { LiveStore } from './live-store.js'
import type { GameRepository } from '../repositories/game.repository.js'
import type { FriendService } from './friend.service.js'
import type { ProfileService } from './profile.service.js'
import type { NotificationService } from './notification.service.js'
import { ApiError } from '../http/api-error.js'

/**
 * Who is playing with whom.
 *
 * A party is a host and the people who joined their game. There is no party
 * object stored anywhere — it is derived from who is currently claiming that
 * host, so there is no lifecycle to manage and nothing to clean up when the
 * last person leaves.
 *
 * **Every count below is of people who are still here.** That is not a detail:
 * it is what frees the seat a closed tab used to hold forever, and it falls out
 * of the store rather than being special-cased anywhere in this file.
 *
 * See ADR-0028 and ADR-0045.
 */
export class PartyService {
  constructor(
    private readonly live: LiveStore,
    private readonly games: GameRepository,
    private readonly friends: FriendService,
    private readonly profiles: ProfileService,
    private readonly notifications?: NotificationService,
  ) {}

  /**
   * Whose game this player is in — themselves, unless they have joined somebody
   * and are still here to say so.
   *
   * The same indirection `GameService.hostFor` uses (ADR-0028). Async only
   * because everything calling it already awaits; the answer is in memory.
   */
  async hostOf(userId: string): Promise<string> {
    return this.live.hostOf(userId)
  }

  /** Everybody who has joined this host and is still here. Does not include the host. */
  async memberIdsOf(hostUserId: string): Promise<string[]> {
    return this.live.membersOf(hostUserId)
  }

  async of(userId: string): Promise<Party> {
    const hostUserId = this.live.hostOf(userId)

    // Everybody pointing at this host, minus whoever is asking — the caller is
    // never "somebody playing with you". Without this a guest is shown to
    // themselves as another member of the party they are in.
    const memberIds = this.live.membersOf(hostUserId).filter((id) => id !== userId)

    const profiles = await this.profiles.mapOf([hostUserId, ...memberIds])
    const host = profiles.get(hostUserId) ?? placeholder(hostUserId)

    return {
      host,
      members: memberIds.flatMap((id) => {
        const profile = profiles.get(id)
        return profile ? [profile] : []
      }),
      isHost: hostUserId === userId,
    }
  }

  /**
   * Asks a friend to come and play.
   *
   * Only an invitation — it creates a notification and nothing else. Joining is
   * the invitee's decision, because pulling somebody out of their own
   * half-finished game without asking would lose their place.
   */
  async invite(userId: string, friendUserId: string): Promise<void> {
    if (userId === friendUserId) {
      throw new ApiError(400, 'CANNOT_FRIEND_SELF', 'You are already in your own game.')
    }
    if (!(await this.friends.areFriends(userId, friendUserId))) {
      throw new ApiError(403, 'NOT_FRIENDS', 'You can only invite friends into your game.')
    }

    // You can only invite people into a game you host. Somebody who has joined
    // another party would otherwise be inviting people into a game that is not
    // theirs to share.
    if (this.live.hostOf(userId) !== userId) {
      throw new ApiError(
        409,
        'NOT_HOST',
        'You are playing in somebody else’s game. Leave it first to host your own.',
      )
    }

    const me = await this.profiles.findByUserId(userId)
    await this.notifications?.notifyQuietly(
      friendUserId,
      'party_invite',
      `${me?.displayName || me?.username || 'A friend'} invited you into their game.`,
      userId,
    )
  }

  /**
   * Joins a friend's game.
   *
   * The player's own game is left exactly where it is, unreferenced — leaving
   * the party puts them back into it. Merging two sets of progress has no
   * correct answer, and losing somebody's solo game to join a friend for five
   * minutes would be worse than either.
   */
  async join(userId: string, hostUserId: string): Promise<Party> {
    if (userId === hostUserId) {
      throw new ApiError(400, 'CANNOT_FRIEND_SELF', 'You are already in your own game.')
    }
    if (!(await this.friends.areFriends(userId, hostUserId))) {
      throw new ApiError(403, 'NOT_FRIENDS', 'You can only join a friend’s game.')
    }

    // No chains: joining somebody who has themselves joined a third person
    // would make "whose game is this?" a graph walk instead of one lookup.
    if (this.live.hostOf(hostUserId) !== hostUserId) {
      throw new ApiError(409, 'NOT_HOST', 'They are playing in somebody else’s game.')
    }

    // The same rule from the other end. Leaving while people are in *your*
    // game does not move them with you — they would carry on pointing at a
    // game you are no longer playing, alone and unaware.
    //
    // Guests who have closed their tabs do not count, so a host whose friends
    // all left is free to go and join somebody else without having to remove
    // people who are not there.
    const ownGuests = this.live.membersOf(userId)
    if (ownGuests.length > 0) {
      throw new ApiError(
        409,
        'NOT_HOST',
        'People are playing in your game. Remove them first, or ask them to leave.',
      )
    }

    if (!(await this.games.findByUserId(hostUserId))) {
      throw new ApiError(404, 'SESSION_NOT_FOUND', 'They have not started a game yet.')
    }

    // Four is a party; thirty is a crowd, and on a stage it is a wall of
    // overlapping characters. Counted as host plus guests, so the cap is the
    // number of people in the room rather than the number who joined — and
    // only the ones still here, so a seat held by a closed tab is not a seat.
    const existing = this.live.membersOf(hostUserId)
    if (existing.length + 1 >= MAX_PARTY_SIZE) {
      throw new ApiError(409, 'PARTY_FULL', 'That game is full.')
    }

    this.live.claim(userId, hostUserId)

    const me = await this.profiles.findByUserId(userId)
    await this.notifications?.notifyQuietly(
      hostUserId,
      'party_invite',
      `${me?.displayName || me?.username || 'A friend'} joined your game.`,
      userId,
    )

    return this.of(userId)
  }

  /** Goes back to your own game. A host has nothing to leave. */
  async leave(userId: string): Promise<Party> {
    this.live.release(userId)
    return this.of(userId)
  }

  /** The host sending somebody home. */
  async remove(hostUserId: string, memberUserId: string): Promise<Party> {
    // A host resolves to themselves, so without the first half of this a host
    // could "remove" themselves and get a 204 for doing nothing.
    if (memberUserId === hostUserId || this.live.hostOf(memberUserId) !== hostUserId) {
      throw new ApiError(404, 'SESSION_NOT_FOUND', 'They are not in your game.')
    }

    this.live.release(memberUserId)
    return this.of(hostUserId)
  }
}

/**
 * Stands in for somebody whose profile has not been written yet.
 *
 * Better than dropping them from the party: a missing row would make it look
 * like nobody is hosting.
 */
function placeholder(userId: string): PublicProfile {
  return { userId, username: 'unknown', displayName: 'Unknown player', imageUrl: null }
}
