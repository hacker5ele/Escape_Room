import type { LiveRoom, RoomId } from '@escape-room/shared'
import type { LiveStore } from './live-store.js'
import {
  beginHall,
  penaliseHall,
  publicHall,
  tickHall,
  tideTrend,
  type Acted,
  type HallState,
  type Occupant,
} from '../domain/rooms/hall/hall.js'
import { isNear, stationById } from '../domain/rooms/hall/layout.js'

/**
 * The halls currently under water, one per party.
 *
 * Keyed by host, exactly like `PresenceService`'s phases and for the same
 * reason: a game is found from the party and never named on the wire
 * (ADR-0028), so there is nothing here for a client to point at.
 *
 * **In memory, and it empties itself.** A hall is begun the first time somebody
 * beats from inside it and thrown away the moment the party is anywhere else,
 * so there is no row to expire, nothing to migrate, and a restart simply means
 * every hall is dry again. That is the same trade presence has always made
 * (ADR-0038, ADR-0045), and it is only sound because App Runner is pinned to a
 * single instance — two of them would each flood half the room.
 */
export class HallService {
  readonly #halls = new Map<string, HallState>()

  constructor(private readonly live: LiveStore) {}

  /**
   * One beat of this party's hall, from whichever heartbeat arrived.
   *
   * There is no timer anywhere in this feature. A hall with nobody in it is not
   * ticking, which is both the cheap answer and the correct one: the water
   * should not rise in a room that no longer has anybody to drown.
   */
  beat(
    hostUserId: string,
    roomId: RoomId,
    now: number = Date.now(),
    acted?: Acted,
  ): LiveRoom | null {
    if (!isFloodable(roomId)) {
      this.clear(hostUserId)
      return null
    }

    const occupants = this.#occupants(hostUserId, now)
    const existing = this.#halls.get(hostUserId)
    // Seeded from the whole party rather than from whoever has beaten so far.
    // A hall is created by the *first* beat to arrive, and when two people walk
    // in together theirs are only milliseconds apart — so counting the standing
    // occupants here gave a pair the solo shape for the first five seconds,
    // until the re-form noticed. The party is already known; guessing from it is
    // right far more often than it is wrong, and the re-form still corrects it.
    const state = existing ?? beginHall(now, this.#partySize(hostUserId, now))
    if (!existing) this.#halls.set(hostUserId, state)

    tickHall(state, now, occupants, acted)

    return {
      roomId,
      depth: state.depth,
      trend: tideTrend(state, now),
      act: state.act,
      counted: state.counted,
      drowned: state.drowned,
      detail: publicHall(state, now),
    }
  }

  /**
   * The party is somewhere else, so the hall drains.
   *
   * Which is also how drowning resets: everybody is put back in the lobby, the
   * next beat comes from there, and the hall they died in is gone. Walking out
   * and being carried out cost the same, deliberately — a room you can leave
   * halfway through and come back to is a room you can chip away at until the
   * clock stops meaning anything.
   */
  clear(hostUserId: string): void {
    this.#halls.delete(hostUserId)
  }

  /**
   * A wrong code at the vault door.
   *
   * Called from the attempt route rather than from the room's `check()`, which
   * stays pure and knows nothing about water. Resolving the host here rather
   * than taking one means no caller can surge somebody else's hall.
   */
  penalise(userId: string, roomId: RoomId, now: number = Date.now()): void {
    if (!isFloodable(roomId)) return
    const state = this.#halls.get(this.live.hostOf(userId, now))
    if (state) penaliseHall(state)
  }

  /** Test seam. */
  find(hostUserId: string): HallState | undefined {
    return this.#halls.get(hostUserId)
  }

  /**
   * Everybody in this party who is actually standing in the room.
   *
   * Somebody in the party reading the leaderboard has no position, so they are
   * not a pair of hands the hall can count — which is what makes "the hall
   * counts you" mean the people in the room rather than the people in the game.
   */
  /** Everybody live in this party, standing or not. The host counts themselves. */
  #partySize(hostUserId: string, now: number): number {
    return 1 + this.live.membersOf(hostUserId, now).length
  }

  #occupants(hostUserId: string, now: number): Occupant[] {
    const ids = [hostUserId, ...this.live.membersOf(hostUserId, now)]
    const occupants: Occupant[] = []

    for (const userId of ids) {
      const standing = this.live.standingOf(userId, now)
      if (!standing) continue
      occupants.push({
        userId,
        x: standing.x,
        y: standing.y,
        facing: standing.facing,
        walking: standing.walking,
        // Verified here rather than where it was stored. A client that claims
        // to have hold of a winch at the other end of the hall is holding
        // nothing — the same stance the position itself has always had, which
        // is clamped rather than trusted.
        holding: heldWithinReach(standing.holding, standing),
      })
    }

    return occupants
  }
}

/** Only the Reading Hall has a clock in it. Everything else is a question and a box. */
function isFloodable(roomId: RoomId): boolean {
  return roomId === 'room-01'
}

/** A station somebody claims to be holding, if they are close enough to hold it. */
function heldWithinReach(holding: string | null, at: { x: number; y: number }): string | null {
  if (!holding) return null
  const station = stationById(holding)
  return station && isNear(station, at) ? holding : null
}
