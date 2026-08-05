import { useCallback, useEffect, useRef, useState } from 'react'
import type { HeartbeatResponse, PartyPhase, Peer } from '@escape-room/shared'
import { heartbeatResponseSchema } from '@escape-room/shared'
import { request } from '../api/client'
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

  const tracks = useRef(new Map<string, Track>())
  const pendingEmote = useRef<EmoteName | null>(null)

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

  useEffect(() => {
    if (!enabled) return

    let stopped = false
    let timer: number | undefined

    const beat = async () => {
      try {
        const response = await request('/stage/heartbeat', await authRef.current(), {
          method: 'POST',
          body: JSON.stringify({
            x: Math.round(position.current.x),
            y: Math.round(position.current.y),
            facing: position.current.facing,
            walking: position.current.walking,
            character: characterRef.current,
            ready: readyRef.current,
            emote: pendingEmote.current,
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

    void beat()
    return () => {
      stopped = true
      window.clearTimeout(timer)
    }
  }, [enabled, position])

  // The render loop. Separate from the poll on purpose: positions have to be
  // recomputed every frame to interpolate, but they are only *received* twice a
  // second.
  useEffect(() => {
    if (!enabled) return

    let frame = 0
    const tick = () => {
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

  return { actors, phase, isHost, sendEmote }
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
