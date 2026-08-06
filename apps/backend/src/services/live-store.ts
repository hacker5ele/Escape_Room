import type { CharacterParts, EmoteName } from '@escape-room/shared'
import { PRESENCE_TTL_HIDDEN_MS, PRESENCE_TTL_VISIBLE_MS } from '@escape-room/shared'

/**
 * Who currently has the game open, and what they are claiming.
 *
 * This is the only state the lobby and co-op have between them, and it is one
 * map that empties itself. See ADR-0045.
 *
 * **There is no membership record.** Being in somebody's party used to be a row
 * in DynamoDB with no expiry, removed only by an explicit "leave" — so closing
 * a tab held one of four seats in a friend's game indefinitely. It is now a
 * claim you have to keep alive: stop beating and you leave the lobby and the
 * game by the same expiry, because they are the same fact.
 *
 * **Nothing here is ever required to be deleted.** Every read filters on
 * `lastSeen`, so an entry nobody has swept is still, correctly, not there. The
 * sweep is memory hygiene.
 *
 * In memory, like the positions it replaces, which is only sound because App
 * Runner is pinned to one instance — `min_size = max_size = 1` in
 * `infra/modules/environment/main.tf`. Raise it and two instances would each
 * hold half the room (ADR-0038).
 */

/** Where somebody is standing. Absent until they actually open the stage. */
export interface Standing {
  x: number
  y: number
  facing: 1 | -1
  walking: boolean
  character: CharacterParts
  ready: boolean
  emote: EmoteName | null
  emoteStartedAt: number | null
  /**
   * The station in the room this player has hold of, or null.
   *
   * Stored rather than derived, because having hold of something is a choice
   * and a choice cannot be read off a position. Stored *unverified* — whoever
   * reads it checks it is a station this player could actually reach, the same
   * way `x` and `y` are clamped rather than trusted.
   */
  holding: string | null
}

interface Live {
  userId: string
  /** Whose game they are in. `null` is their own — the common case, stored as nothing. */
  hostUserId: string | null
  /** `null` while they are in the app but not on the stage: in the party rail, not in the room. */
  standing: Standing | null
  /** Their tab was in the background at the last beat, so we are far more patient with it. */
  hidden: boolean
  lastSeen: number
}

export class LiveStore {
  readonly #live = new Map<string, Live>()

  /**
   * Records that somebody still has the game open.
   *
   * Called from every screen, not only the stage — you can be in a friend's
   * game while reading the leaderboard, and a claim nobody renews has ended.
   *
   * Creates the entry if it is missing, so a player who beats before ever
   * joining anybody is simply live and hosting themselves.
   */
  alive(userId: string, hidden: boolean, now: number = Date.now()): void {
    // Only a claim that is *still live* is carried forward. Reading the old
    // entry unconditionally would resurrect one that had already expired, so
    // somebody who closed their laptop for a minute and opened it again would
    // find themselves silently back in a party they had already left — with no
    // join, and no way for the host to have refused it.
    const existing = this.#fresh(userId, now)
    this.#live.set(userId, {
      userId,
      hostUserId: existing?.hostUserId ?? null,
      standing: existing?.standing ?? null,
      hidden,
      lastSeen: now,
    })
    this.#sweep(now)
  }

  /** The same beat, with a position on it. */
  stand(userId: string, hidden: boolean, standing: Standing, now: number = Date.now()): void {
    this.alive(userId, hidden, now)
    const entry = this.#live.get(userId)
    if (entry) entry.standing = standing
  }

  /** Off the stage, still in the app. Their character goes; their claim does not. */
  leaveStage(userId: string): void {
    const entry = this.#live.get(userId)
    if (entry) entry.standing = null
  }

  /**
   * Joins somebody's game.
   *
   * Only ever reached through `PartyService.join`, which is where every rule
   * about who may join whom lives. A client never asserts its own host, so
   * there is nothing here to forge.
   */
  claim(userId: string, hostUserId: string, now: number = Date.now()): void {
    this.alive(userId, false, now)
    const entry = this.#live.get(userId)
    if (entry) entry.hostUserId = hostUserId
  }

  /** Back to your own game, by choice rather than by timing out. */
  release(userId: string): void {
    const entry = this.#live.get(userId)
    if (entry) entry.hostUserId = null
  }

  /**
   * Whose game this player is in — their own, unless they have joined somebody
   * and are still here to say so.
   *
   * The whole of the co-op indirection, and the whole of the fix: a player who
   * closed their tab resolves to themselves again, so their solves go to their
   * own game and their seat in the party is free.
   */
  hostOf(userId: string, now: number = Date.now()): string {
    return this.#fresh(userId, now)?.hostUserId ?? userId
  }

  /** Everybody who is in this host's game *and* still here. Excludes the host. */
  membersOf(hostUserId: string, now: number = Date.now()): string[] {
    return [...this.#live.values()]
      .filter((entry) => entry.hostUserId === hostUserId && isLive(entry, now))
      .map((entry) => entry.userId)
  }

  /**
   * Do they have the game open?
   *
   * The same question the whole store answers, asked directly — so an
   * invitation can be told in the app to somebody who is here and emailed to
   * somebody who is not (ADR-0046).
   */
  isLive(userId: string, now: number = Date.now()): boolean {
    return this.#fresh(userId, now) !== null
  }

  /** Where somebody is standing, or null if they are not on the stage or not here. */
  standingOf(userId: string, now: number = Date.now()): Standing | null {
    return this.#fresh(userId, now)?.standing ?? null
  }

  /** When we last heard from them, so a peer can be drawn faded before it is dropped. */
  lastSeenOf(userId: string, now: number = Date.now()): number | null {
    return this.#fresh(userId, now)?.lastSeen ?? null
  }

  /** Test seam. Everything else about the store is observable through a beat. */
  size(): number {
    return this.#live.size
  }

  /**
   * Test seam: pretend everybody last beat `ms` earlier than they did.
   *
   * The alternative is moving the system clock, and that turned out to be a bad
   * idea in a suite — `vi.setSystemTime` is global to the worker, so a test
   * travelling fifteen seconds into the future can be observed by whatever else
   * happens to be running, and the failure lands on an unrelated assertion in
   * another file. This ages only this store.
   */
  rewind(ms: number): void {
    for (const entry of this.#live.values()) entry.lastSeen -= ms
  }

  #fresh(userId: string, now: number): Live | null {
    const entry = this.#live.get(userId)
    return entry && isLive(entry, now) ? entry : null
  }

  /**
   * Drops anybody who has been silent too long.
   *
   * Swept on each beat rather than on a timer: there is no work to do when
   * nobody is playing, and a background interval would keep the process awake
   * to tidy an empty room. Correctness never depends on this having run.
   */
  #sweep(now: number): void {
    for (const [id, entry] of this.#live) {
      if (!isLive(entry, now)) this.#live.delete(id)
    }
  }
}

/**
 * Patience depends on what the tab last said about itself.
 *
 * A tab that was visible and has gone quiet was closed, and that is the case
 * worth being quick about. A hidden one is being throttled by the browser —
 * Chrome clamps background timers to roughly one a minute after five minutes —
 * and cannot be told apart from a closed one, so it gets the benefit of the
 * doubt rather than being thrown out of a game for looking at another tab.
 */
function isLive(entry: Live, now: number): boolean {
  const ttl = entry.hidden ? PRESENCE_TTL_HIDDEN_MS : PRESENCE_TTL_VISIBLE_MS
  return now - entry.lastSeen <= ttl
}
