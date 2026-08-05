import type {
  CharacterParts,
  EmoteName,
  HeartbeatRequest,
  HeartbeatResponse,
  Peer,
  PartyPhase,
  PublicProfile,
} from '@escape-room/shared'
import {
  PRESENCE_AWAY_MS,
  PRESENCE_TTL_MS,
  STAGE_BOUNDS,
} from '@escape-room/shared'
import type { PartyService } from './party.service.js'
import type { ProfileService } from './profile.service.js'

/**
 * Who is standing where.
 *
 * **In memory, deliberately.** A position is meaningless a second later and a
 * lobby does not outlive the process, so writing 2 Hz of coordinates to
 * DynamoDB would be paying storage prices for something whose whole value is
 * that it is current. A restart resets every lobby and drops nobody from their
 * party, which is the correct failure mode.
 *
 * This is only sound because App Runner is pinned to one instance — see
 * ADR-0038, and the note in `infra/modules/environment/main.tf`.
 */

interface Presence {
  userId: string
  x: number
  y: number
  facing: 1 | -1
  walking: boolean
  character: CharacterParts
  ready: boolean
  emote: EmoteName | null
  emoteStartedAt: number | null
  lastSeen: number
}

export class PresenceService {
  readonly #people = new Map<string, Presence>()
  /** Where each party is, keyed by host. Absent means the lobby. */
  readonly #phases = new Map<string, PartyPhase>()

  constructor(
    private readonly party: PartyService,
    private readonly profiles: ProfileService,
  ) {}

  /**
   * Records where somebody is and answers with everybody else.
   *
   * One call in both directions, because a client that reports its position and
   * then asks for its neighbours has made two round trips to learn one thing.
   */
  async beat(userId: string, body: HeartbeatRequest): Promise<HeartbeatResponse> {
    const now = Date.now()
    const previous = this.#people.get(userId)

    this.#people.set(userId, {
      userId,
      // Clamped rather than trusted. Presence is cosmetic and no puzzle depends
      // on it, but an unclamped client could park a friend's character off the
      // stage for everybody who can see them.
      x: clamp(body.x, STAGE_BOUNDS.minX, STAGE_BOUNDS.maxX),
      y: clamp(body.y, STAGE_BOUNDS.minY, STAGE_BOUNDS.maxY),
      facing: body.facing,
      walking: body.walking,
      character: body.character,
      ready: body.ready,
      // An emote is reported once, on the beat it starts. Holding the previous
      // one until a new arrives is what lets a peer join a dance part-way
      // through and still see it finish.
      emote: body.emote ?? (previous?.emote ?? null),
      emoteStartedAt: body.emote ? now : (previous?.emoteStartedAt ?? null),
      lastSeen: now,
    })

    const host = await this.party.hostOf(userId)
    const members = await this.party.memberIdsOf(host)
    const everyone = [host, ...members]

    this.#sweep(now)

    const others = everyone.filter((id) => id !== userId)
    const profiles = await this.profiles.mapOf(others)

    const peers: Peer[] = others
      .map((id) => {
        const seen = this.#people.get(id)
        const profile = profiles.get(id)
        // Somebody in the party who has not opened the stage yet is simply not
        // on it. They are in the party rail, not standing in the room.
        if (!seen || !profile) return null
        return toPeer(seen, profile, id === host, now)
      })
      .filter((peer): peer is Peer => peer !== null)

    return {
      now: new Date(now).toISOString(),
      peers,
      phase: this.#phases.get(host) ?? { kind: 'lobby' },
      isHost: host === userId,
    }
  }

  /**
   * Moves the whole party.
   *
   * Only the host may call this, which is checked by the route. Guests learn
   * about it on their next heartbeat and follow — which is how "the host
   * pressed play" travels without anything being pushed.
   */
  setPhase(hostUserId: string, phase: PartyPhase): void {
    this.#phases.set(hostUserId, phase)
  }

  /** Forgets somebody immediately, rather than waiting for them to time out. */
  forget(userId: string): void {
    this.#people.delete(userId)
    this.#phases.delete(userId)
  }

  /** Test seam: presence is otherwise only observable through a heartbeat. */
  peekLastSeen(userId: string): number | null {
    return this.#people.get(userId)?.lastSeen ?? null
  }

  /**
   * Drops anybody who has been silent too long.
   *
   * Swept on each heartbeat rather than on a timer: there is no work to do when
   * nobody is playing, and a background interval would keep the process awake
   * to tidy an empty room.
   */
  #sweep(now: number): void {
    for (const [id, seen] of this.#people) {
      if (now - seen.lastSeen > PRESENCE_TTL_MS) this.#people.delete(id)
    }
  }
}

function toPeer(seen: Presence, profile: PublicProfile, isHost: boolean, now: number): Peer {
  return {
    profile,
    x: seen.x,
    y: seen.y,
    facing: seen.facing,
    walking: seen.walking,
    character: seen.character,
    ready: seen.ready,
    isHost,
    emote: seen.emote,
    emoteStartedAt: seen.emoteStartedAt ? new Date(seen.emoteStartedAt).toISOString() : null,
    away: now - seen.lastSeen > PRESENCE_AWAY_MS,
  }
}

function clamp(value: number, low: number, high: number): number {
  // NaN fails every comparison, so it has to be caught rather than clamped.
  if (!Number.isFinite(value)) return low
  return Math.min(high, Math.max(low, value))
}
