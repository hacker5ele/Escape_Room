import { useCallback, useEffect, useRef, useState } from 'react'
import type { HeartbeatResponse, LiveRoom, PartyPhase, Peer } from '@escape-room/shared'
import { heartbeatResponseSchema } from '@escape-room/shared'
import { request } from '../api/client'
import { markStageBeat } from '../api/stage'
import { useAppAuth } from '../auth/useAppAuth'
import type { EmoteName } from '../character/emotes'
import type { Character } from '../character/parts'
import type { Position } from './useMovement'

/**
 * Everybody else on the stage.
 *
 * There are no WebSockets on App Runner (ADR-0025), so this is polled — but
 * polled *and* interpolated, which is the difference between a friend walking
 * and a friend teleporting twice a second. Each peer is drawn moving toward
 * where they last were rather than snapped to it, so a 500 ms update rate reads
 * as movement about half a second behind rather than as a slideshow.
 *
 * One request does both directions: it reports where you are and returns where
 * everybody else is. Asking separately would be two round trips to learn one
 * thing.
 */

/** Twice a second while the tab is visible. 240/minute is the limit; this is 120. */
const ACTIVE_MS = 500

/**
 * And once every five seconds when it is not.
 *
 * Slowed rather than stopped, unlike `/api/sync`: stopping would let the server
 * time you out, and a friend watching you would see you disappear because you
 * looked at another tab for ten seconds.
 */
const HIDDEN_MS = 5_000

/**
 * The shortest gap between two beats forced by a keypress.
 *
 * The limit on this endpoint is 240 a minute — two a second with headroom — and
 * the scheduled beat already uses half of it. A player holding E down would eat
 * the rest in a couple of seconds without this.
 */
const FLUSH_MIN_MS = 250

export interface RemoteActor {
  userId: string
  name: string
  character: Character
  x: number
  y: number
  facing: 1 | -1
  walking: boolean
  emote: EmoteName | null
  away: boolean
  isHost: boolean
}

/** A peer's last two known positions, so the renderer can move between them. */
interface Track {
  peer: Peer
  fromX: number
  fromY: number
  toX: number
  toY: number
  /** When the move began, in client time. */
  at: number
}

export function usePresence({
  position,
  character,
  ready,
  enabled = true,
}: {
  position: React.RefObject<Position>
  character: Character
  ready: boolean
  enabled?: boolean
}) {
  const { authHeaders } = useAppAuth()
  const [actors, setActors] = useState<RemoteActor[]>([])
  const [phase, setPhase] = useState<PartyPhase>({ kind: 'lobby' })
  const [isHost, setIsHost] = useState(true)
  /**
   * The room's own state, when the party is standing in one that has a clock.
   *
   * Null everywhere else, which is every room but the Reading Hall. It rides
   * this response rather than a poll of its own because the water changes at
   * exactly the rate presence already runs at — the rule `presence.routes.ts`
   * sets out, applied the other way round (ADR-0048).
   */
  const [room, setRoom] = useState<LiveRoom | null>(null)

  const tracks = useRef(new Map<string, Track>())
  const pendingEmote = useRef<EmoteName | null>(null)
  /** Stations E was pressed at since the last beat. Sent and forgotten. */
  const pendingActs = useRef<string[]>([])
  /** What this player has hold of. State so the room can draw it, ref so the beat can send it. */
  const [holding, setHolding] = useState<string | null>(null)
  const holdingRef = useRef<string | null>(null)
  /** Set by the polling effect so a press can beat straight away instead of waiting. */
  const beatNow = useRef<() => void>(() => {})
  const lastFlush = useRef(0)

  // Read through refs so the polling effect can run once rather than restarting
  // every time a parent re-renders — which, with a character walking, is every
  // frame.
  const authRef = useRef(authHeaders)
  authRef.current = authHeaders
  const characterRef = useRef(character)
  characterRef.current = character
  const readyRef = useRef(ready)
  readyRef.current = ready

  /** Queued for the next beat rather than sent immediately — one request does both. */
  const sendEmote = useCallback((emote: EmoteName) => {
    pendingEmote.current = emote
  }, [])

  /**
   * Beat right now rather than at the next tick.
   *
   * Half a second is a long time to wait for a lamp to light. Everything else
   * on this channel is a position, which is fine arriving late; a keypress is
   * not, and a room where E feels sticky is a room that feels broken.
   *
   * Debounced, because a player leaning on the key would otherwise spend the
   * whole rate limit — 240 a minute — on a single lamp.
   */
  const flush = useCallback(() => {
    const at = performance.now()
    if (at - lastFlush.current < FLUSH_MIN_MS) return
    lastFlush.current = at
    beatNow.current()
  }, [])

  /** Press E at something. Queued for the next beat, which is about to happen. */
  const act = useCallback(
    (stationId: string) => {
      // Capped so a stuck key cannot grow this without bound between beats; the
      // schema refuses more than eight anyway.
      if (pendingActs.current.length < 8) pendingActs.current.push(stationId)
      flush()
    },
    [flush],
  )

  /** Take hold of something, or let go with null. Re-sent every beat until released. */
  const hold = useCallback(
    (stationId: string | null) => {
      holdingRef.current = stationId
      setHolding(stationId)
      flush()
    },
    [flush],
  )

  useEffect(() => {
    if (!enabled) return

    let stopped = false
    let timer: number | undefined

    const beat = async () => {
      // Taken and cleared *before* the request rather than after it, so a flush
      // arriving mid-flight cannot send the same press twice. Losing one to a
      // dropped request is the better failure: pressing E again is nothing, and
      // picking a tablet up twice is a bug.
      const acted = pendingActs.current
      pendingActs.current = []

      try {
        // Tells `useLiveness` to stay quiet: this beat renews the same claim,
        // so a player on the stage sends one request per interval, not two.
        markStageBeat()
        const response = await request('/stage/heartbeat', await authRef.current(), {
          method: 'POST',
          body: JSON.stringify({
            acted,
            holding: holdingRef.current,
            x: Math.round(position.current.x),
            y: Math.round(position.current.y),
            facing: position.current.facing,
            walking: position.current.walking,
            character: characterRef.current,
            ready: readyRef.current,
            emote: pendingEmote.current,
            // A closed tab and a throttled one look identical from the server,
            // and only this side can tell them apart (ADR-0045).
            hidden: document.visibilityState === 'hidden',
          }),
        })

        // Parsed rather than cast: this is the one payload that arrives twice a
        // second, and a shape change should fail here rather than as a
        // character rendered at NaN.
        const body: HeartbeatResponse = heartbeatResponseSchema.parse(await response.json())
        if (stopped) return

        pendingEmote.current = null
        setPhase(body.phase)
        setIsHost(body.isHost)
        setRoom(body.room)

        const now = performance.now()
        const next = new Map<string, Track>()
        for (const peer of body.peers) {
          const previous = tracks.current.get(peer.profile.userId)
          next.set(peer.profile.userId, {
            peer,
            // Interpolate from wherever they are being *drawn*, not from their
            // last reported position — otherwise a peer visibly jumps back to
            // the start of the previous leg on every update.
            fromX: previous ? drawnX(previous, now) : peer.x,
            fromY: previous ? drawnY(previous, now) : peer.y,
            toX: peer.x,
            toY: peer.y,
            at: now,
          })
        }
        tracks.current = next
      } catch {
        // A dropped beat is not worth showing anybody. The next one will either
        // work or the peers will quietly go away when they time out.
      } finally {
        if (!stopped) {
          const wait = document.visibilityState === 'hidden' ? HIDDEN_MS : ACTIVE_MS
          // Chained rather than `setInterval`, so a slow response delays the
          // next request instead of stacking one on top of it.
          timer = window.setTimeout(() => void beat(), wait)
        }
      }
    }

    // Lets `flush` cut the wait short: drop the scheduled beat and go now. The
    // `finally` in `beat` schedules the next one, so the chain is unbroken.
    beatNow.current = () => {
      window.clearTimeout(timer)
      void beat()
    }

    void beat()
    return () => {
      stopped = true
      beatNow.current = () => {}
      window.clearTimeout(timer)
    }
  }, [enabled, position])

  // The render loop. Separate from the poll on purpose: positions have to be
  // recomputed every frame to interpolate, but they are only *received* twice a
  // second.
  useEffect(() => {
    if (!enabled) return

    let frame = 0
    let wasEmpty = false

    const tick = () => {
      // Nothing to interpolate when you are alone, and re-rendering the whole
      // lobby sixty times a second to say so is what starved the countdown's
      // interval. One empty update, then quiet.
      if (tracks.current.size === 0) {
        if (!wasEmpty) {
          wasEmpty = true
          setActors([])
        }
        frame = requestAnimationFrame(tick)
        return
      }
      wasEmpty = false

      const now = performance.now()
      setActors(
        [...tracks.current.values()].map((track) => ({
          userId: track.peer.profile.userId,
          name: track.peer.profile.username,
          character: track.peer.character as Character,
          x: drawnX(track, now),
          y: drawnY(track, now),
          facing: track.peer.facing,
          walking: track.peer.walking,
          emote: track.peer.emote as EmoteName | null,
          away: track.peer.away,
          isHost: track.peer.isHost,
        })),
      )
      frame = requestAnimationFrame(tick)
    }

    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [enabled])

  return { actors, phase, isHost, room, holding, sendEmote, act, hold }
}

/**
 * How far along the last leg a peer should be drawn.
 *
 * Clamped at 1, so somebody who has stopped sending updates stands still at
 * their last known position rather than drifting off the stage — which is what
 * extrapolating instead of interpolating would do.
 */
function progress(track: Track, now: number): number {
  return Math.min(1, (now - track.at) / ACTIVE_MS)
}

function drawnX(track: Track, now: number): number {
  return track.fromX + (track.toX - track.fromX) * progress(track, now)
}

function drawnY(track: Track, now: number): number {
  return track.fromY + (track.toY - track.fromY) * progress(track, now)
}

/**
 * A peer, as the stage wants it.
 *
 * The character is validated on the way in rather than trusted: it arrives from
 * another client via the server, which passes the four ids through without
 * knowing the catalogue. An unknown id means a part that no longer exists, and
 * drawing nothing is better than drawing a broken image.
 */
export function toActor(peer: RemoteActor) {
  return {
    userId: peer.userId,
    name: peer.name,
    character: peer.character,
    x: peer.x,
    y: peer.y,
    facing: peer.facing,
    walking: peer.walking,
    emote: peer.emote,
    away: peer.away,
    isHost: peer.isHost,
  }
}
