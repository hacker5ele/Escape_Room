import type { GameSession, LeaderboardEntry, PublicProfile } from '@escape-room/shared'
import type { GameRepository } from '../repositories/game.repository.js'
import type { FriendService } from './friend.service.js'
import type { ProfileService } from './profile.service.js'

/**
 * How a player and their friends are getting on.
 *
 * Reads what the game already records rather than maintaining a score table.
 * There is nothing to keep in step, and a player's row cannot disagree with
 * their own progress screen.
 *
 * Two boards, and they answer different questions. "Friends" is how you are
 * doing among people who chose each other, which is a reason to keep playing.
 * "Global" is where the room as a whole has got to. See ADR-0034 — the friends
 * board was originally the only one, on the grounds that a class-wide ranking
 * is a way to make the slowest person feel bad in public, and that concern has
 * not gone away; it is why Friends stays the default view.
 */

/**
 * How many players the global board will look at.
 *
 * There is no index of "all players", so this is a table scan — the only one in
 * the app — and the cap is what stops it growing without limit. Comfortably
 * above a school's worth of accounts, and the board shows fewer than this.
 */
export const GLOBAL_LEADERBOARD_LIMIT = 200

export class LeaderboardService {
  constructor(
    private readonly games: GameRepository,
    private readonly friends: FriendService,
    private readonly profiles: ProfileService,
  ) {}

  async friendsOf(userId: string): Promise<LeaderboardEntry[]> {
    const { friends } = await this.friends.list(userId)

    const me = await this.profiles.findByUserId(userId)
    const people: Array<{ profile: PublicProfile; isMe: boolean }> = [
      ...(me ? [{ profile: me, isMe: true }] : []),
      ...friends.map((friend) => ({ profile: friend.profile, isMe: false })),
    ]

    // One lookup per player. At a class-sized friend list that is a handful of
    // key reads; if it ever grows, the repository gains a batch method and
    // nothing above it changes.
    const entries = await Promise.all(
      people.map(async ({ profile, isMe }) => {
        const game = await this.games.findByUserId(profile.userId)
        return toEntry(profile, game, isMe)
      }),
    )

    return entries.sort(compare)
  }

  /**
   * Everybody who has a profile, best first.
   *
   * Built from the same parts as the friends board and sorted by the same rule,
   * so a player cannot be above someone on one board and below them on the
   * other.
   *
   * Only players who have actually started a game appear. Somebody who
   * registered and never opened a room is not "last" — they are not playing,
   * and listing them at the bottom of a public ranking says something untrue
   * about them.
   */
  async global(userId: string): Promise<LeaderboardEntry[]> {
    const profiles = await this.profiles.listAll(GLOBAL_LEADERBOARD_LIMIT)

    const entries = await Promise.all(
      profiles.map(async (profile) => {
        const game = await this.games.findByUserId(profile.userId)
        return game ? toEntry(profile, game, profile.userId === userId) : null
      }),
    )

    return entries.filter((entry): entry is LeaderboardEntry => entry !== null).sort(compare)
  }
}

function toEntry(
  profile: PublicProfile,
  game: GameSession | null,
  isMe: boolean,
): LeaderboardEntry {
  if (!game) {
    // Somebody who has a profile but has not opened a game yet. Shown at the
    // bottom rather than hidden — they are still your friend.
    return { profile, solvedRooms: 0, hintsUsed: 0, finishedInMs: null, isMe }
  }

  const finishedInMs =
    game.finishedAt !== null
      ? Math.max(0, Date.parse(game.finishedAt) - Date.parse(game.startedAt))
      : null

  return {
    profile,
    solvedRooms: game.solvedRooms.length,
    hintsUsed: game.hintsUsed,
    finishedInMs,
    isMe,
  }
}

/**
 * Most rooms first, then whoever finished fastest, then fewest hints.
 *
 * Rooms come first because that is what the game is about. Time only separates
 * people who have solved the same number, and it only exists for someone who
 * has actually finished — ranking an unfinished game by elapsed time would put
 * whoever started most recently on top.
 */
function compare(a: LeaderboardEntry, b: LeaderboardEntry): number {
  if (a.solvedRooms !== b.solvedRooms) return b.solvedRooms - a.solvedRooms

  if (a.finishedInMs !== null && b.finishedInMs !== null && a.finishedInMs !== b.finishedInMs) {
    return a.finishedInMs - b.finishedInMs
  }
  // A finished game beats an unfinished one on equal rooms.
  if (a.finishedInMs !== null && b.finishedInMs === null) return -1
  if (a.finishedInMs === null && b.finishedInMs !== null) return 1

  if (a.hintsUsed !== b.hintsUsed) return a.hintsUsed - b.hintsUsed

  // Stable and predictable rather than dependent on query order.
  return a.profile.username.localeCompare(b.profile.username)
}
