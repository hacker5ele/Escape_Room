import type { PublicProfile } from '@escape-room/shared'
import type { ProfileRepository } from '../repositories/profile.repository.js'
import type { PlayerProfile } from '../http/authenticator.js'

export class ProfileService {
  constructor(private readonly repository: ProfileRepository) {}

  /**
   * Records what the identity provider currently says about a player.
   *
   * Called on every sign-in rather than only on first sight, so a changed
   * avatar or display name propagates without anyone having to think about
   * cache invalidation. It is cheap: the profile has already been fetched to
   * decide whether the account is complete enough to play.
   *
   * Returns null for an incomplete profile. A player without a username has no
   * public identity to publish, and publishing a half-formed one would put an
   * unnamed row in somebody's friend list.
   */
  async recordFromIdentity(userId: string, identity: PlayerProfile): Promise<PublicProfile | null> {
    if (!identity.username) return null

    const displayName = [identity.firstName, identity.lastName]
      .filter(Boolean)
      .join(' ')
      .trim()

    return this.repository.save({
      userId,
      username: identity.username,
      // Falls back to the username so a name is never blank on screen.
      displayName: displayName || identity.username,
      imageUrl: identity.imageUrl,
    })
  }

  async findByUserId(userId: string): Promise<PublicProfile | null> {
    return this.repository.findByUserId(userId)
  }

  /** Case-insensitive. Used to add a friend by username. */
  async findByUsername(username: string): Promise<PublicProfile | null> {
    const trimmed = username.trim()
    if (!trimmed) return null
    return this.repository.findByUsername(trimmed)
  }

  /**
   * Profiles for a list of people, keyed by user id for easy lookup while
   * rendering. Missing entries are simply absent rather than throwing — a
   * friend whose profile has not been written yet should leave a gap, not
   * break the whole list.
   */
  async mapOf(userIds: string[]): Promise<Map<string, PublicProfile>> {
    const profiles = await this.repository.findManyByUserId(userIds)
    return new Map(profiles.map((profile) => [profile.userId, profile]))
  }

  /**
   * Every player, up to `limit`, for the global leaderboard.
   *
   * The only caller that wants everybody rather than a named few. Kept behind
   * the service like every other read so the leaderboard never touches a
   * repository directly, and so there is one place to look when asking what in
   * this app scans the whole table.
   */
  async listAll(limit: number): Promise<PublicProfile[]> {
    return this.repository.listAll(limit)
  }
}
