import type { Party, PublicProfile } from '@escape-room/shared'
import type { PartyRepository } from '../repositories/party.repository.js'
import type { GameRepository } from '../repositories/game.repository.js'
import type { FriendService } from './friend.service.js'
import type { ProfileService } from './profile.service.js'
import type { NotificationService } from './notification.service.js'
import { ApiError } from '../http/api-error.js'

/**
 * Who is playing with whom.
 *
 * A party is a host and the people who joined their game. There is no party
 * object stored anywhere — it is derived from the membership rows, so there is
 * no lifecycle to manage and nothing to clean up when the last person leaves.
 *
 * See ADR-0028.
 */
export class PartyService {
  constructor(
    private readonly repository: PartyRepository,
    private readonly games: GameRepository,
    private readonly friends: FriendService,
    private readonly profiles: ProfileService,
    private readonly notifications?: NotificationService,
  ) {}

  async of(userId: string): Promise<Party> {
    const membership = await this.repository.find(userId)
    const hostUserId = membership?.hostUserId ?? userId

    const memberIds = (await this.repository.listMembers(hostUserId)).map(
      (record) => record.userId,
    )

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
    const membership = await this.repository.find(userId)
    if (membership) {
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
    const hostMembership = await this.repository.find(hostUserId)
    if (hostMembership) {
      throw new ApiError(409, 'NOT_HOST', 'They are playing in somebody else’s game.')
    }

    if (!(await this.games.findByUserId(hostUserId))) {
      throw new ApiError(404, 'SESSION_NOT_FOUND', 'They have not started a game yet.')
    }

    await this.repository.put({
      userId,
      hostUserId,
      joinedAt: new Date().toISOString(),
    })

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
    await this.repository.remove(userId)
    return this.of(userId)
  }

  /** The host sending somebody home. */
  async remove(hostUserId: string, memberUserId: string): Promise<Party> {
    const membership = await this.repository.find(memberUserId)
    if (membership?.hostUserId !== hostUserId) {
      throw new ApiError(404, 'SESSION_NOT_FOUND', 'They are not in your game.')
    }

    await this.repository.remove(memberUserId)
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
