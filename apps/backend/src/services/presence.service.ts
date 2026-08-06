import type {
  HeartbeatRequest,
  HeartbeatResponse,
  Peer,
  PartyPhase,
  PublicProfile,
} from '@escape-room/shared'
import { PRESENCE_AWAY_MS, STAGE_BOUNDS } from '@escape-room/shared'
import type { LiveStore, Standing } from './live-store.js'
import type { ProfileService } from './profile.service.js'
import type { HallService } from './hall.service.js'

/**
 * Who is standing where.
 *
 * The positions half of `LiveStore` — the claims half is `PartyService`. Both
 * read the same map, which is why "I left the lobby" and "I left the game" are
 * one expiry rather than two things that can disagree (ADR-0045).
 *
 * **In memory, deliberately.** A position is meaningless a second later and a
 * lobby does not outlive the process, so writing 2 Hz of coordinates to
 * DynamoDB would be paying storage prices for something whose whole value is
 * that it is current.
 *
 * This is only sound because App Runner is pinned to one instance — see
 * ADR-0038, and the note in `infra/modules/environment/main.tf`.
 */
export class PresenceService {
  /** Where each party is, keyed by host. Absent means the lobby. */
  readonly #phases = new Map<string, PartyPhase>()

  constructor(
    private readonly live: LiveStore,
    private readonly profiles: ProfileService,
    private readonly halls: HallService,
  ) {}

  /**
   * Records where somebody is and answers with everybody else.
   *
   * One call in both directions, because a client that reports its position and
   * then asks for its neighbours has made two round trips to learn one thing.
   * It is also the beat that keeps their claim on the party alive, so a player
   * on the stage never needs to send anything else.
   */
  async beat(userId: string, body: HeartbeatRequest): Promise<HeartbeatResponse> {
    const now = Date.now()
    const previous = this.live.standingOf(userId, now)

    const standing: Standing = {
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
      emote: body.emote ?? previous?.emote ?? null,
      emoteStartedAt: body.emote ? now : (previous?.emoteStartedAt ?? null),
    }

    this.live.stand(userId, body.hidden, standing, now)

    const host = this.live.hostOf(userId, now)
    const others = [host, ...this.live.membersOf(host, now)].filter((id) => id !== userId)
    const profiles = await this.profiles.mapOf(others)

    const peers: Peer[] = others
      .map((id) => {
        const seen = this.live.standingOf(id, now)
        const lastSeen = this.live.lastSeenOf(id, now)
        const profile = profiles.get(id)
        // Somebody in the party who has not opened the stage yet is simply not
        // on it. They are in the party rail, not standing in the room.
        if (!seen || lastSeen === null || !profile) return null
        return toPeer(seen, profile, id === host, now - lastSeen)
      })
      .filter((peer): peer is Peer => peer !== null)

    const phase = this.#phases.get(host) ?? { kind: 'lobby' }

    // A room with a clock in it rides this beat rather than taking an endpoint
    // of its own — the rule this file's own routes state, which is to share
    // when the cadences match. The water changes twice a second and so does
    // this. Anywhere else, the hall drains: leaving a room and dying in one
    // cost the same, so there is no half-finished flood to come back to.
    const room =
      phase.kind === 'room' ? this.halls.beat(host, phase.roomId, now) : this.#drain(host)

    return {
      now: new Date(now).toISOString(),
      peers,
      phase,
      isHost: host === userId,
      room,
    }
  }

  #drain(hostUserId: string): null {
    this.halls.clear(hostUserId)
    return null
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

  /**
   * Off the stage, still in the app.
   *
   * Walking out of the lobby to look at the leaderboard takes your character
   * out of the room at once — this is the one departure that is a real click
   * rather than a guess about an unloading page, so it is the one that can be
   * immediate. Your claim on the party is untouched: you are still playing with
   * them, you are just not standing there.
   */
  leaveStage(userId: string): void {
    this.live.leaveStage(userId)
    this.#phases.delete(userId)
  }
}

function toPeer(
  standing: Standing,
  profile: PublicProfile,
  isHost: boolean,
  silentFor: number,
): Peer {
  return {
    profile,
    x: standing.x,
    y: standing.y,
    facing: standing.facing,
    walking: standing.walking,
    character: standing.character,
    ready: standing.ready,
    isHost,
    emote: standing.emote,
    emoteStartedAt: standing.emoteStartedAt
      ? new Date(standing.emoteStartedAt).toISOString()
      : null,
    away: silentFor > PRESENCE_AWAY_MS,
  }
}

function clamp(value: number, low: number, high: number): number {
  // NaN fails every comparison, so it has to be caught rather than clamped.
  if (!Number.isFinite(value)) return low
  return Math.min(high, Math.max(low, value))
}
