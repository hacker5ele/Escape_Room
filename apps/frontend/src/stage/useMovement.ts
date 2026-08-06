import { useEffect, useRef, useState } from 'react'
import { WALK_BOUNDS } from './scenes'

/**
 * Walking about.
 *
 * Position is held in a ref and mirrored into state once per animation frame,
 * not once per key event: a held arrow fires at the operating system's repeat
 * rate, which is both slower and less even than the screen refreshes. Reading
 * the *set* of keys currently down and integrating against real elapsed time is
 * what makes the movement smooth and the same speed on every machine.
 *
 * Movement is local-first and always authoritative for your own character —
 * your position is sent on the next heartbeat, never received back and applied.
 * Anything else would make your own character lag your own keys by the width of
 * a network round trip.
 */

export interface Position {
  x: number
  y: number
  facing: 1 | -1
  walking: boolean
}

/** Stage units per second. Crossing the stage takes about four seconds. */
const SPEED = 340

const KEYS: Record<string, [number, number]> = {
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  KeyW: [0, -1],
  KeyS: [0, 1],
  KeyA: [-1, 0],
  KeyD: [1, 0],
}

function clamp(x: number, y: number): { x: number; y: number } {
  return {
    x: Math.min(WALK_BOUNDS.maxX, Math.max(WALK_BOUNDS.minX, x)),
    y: Math.min(WALK_BOUNDS.maxY, Math.max(WALK_BOUNDS.minY, y)),
  }
}

export function useMovement(start: { x: number; y: number }, enabled = true) {
  const [position, setPosition] = useState<Position>({ ...start, facing: 1, walking: false })
  const current = useRef<Position>({ ...start, facing: 1, walking: false })
  const held = useRef(new Set<string>());
  /** Where a touch drag is pulling us, in stage units. Null when not dragging. */
  const target = useRef<{ x: number; y: number } | null>(null)

  useEffect(() => {
    if (!enabled) return

    const down = (event: KeyboardEvent) => {
      if (!KEYS[event.code]) return
      // Typing an answer is not a walk command — WASD has to reach the input
      // that is focused, or "a" can never be typed into a puzzle answer.
      const target = event.target
      if (
        target instanceof HTMLElement &&
        (target instanceof HTMLInputElement ||
          target instanceof HTMLTextAreaElement ||
          target.isContentEditable)
      ) {
        return
      }
      // Otherwise the arrows scroll the page out from under the stage.
      event.preventDefault()
      held.current.add(event.code)
    }
    const up = (event: KeyboardEvent) => held.current.delete(event.code)
    // A held key that is down when the window loses focus never fires `keyup`,
    // and the character walks into the wall for ever.
    const clear = () => held.current.clear()

    window.addEventListener('keydown', down, { passive: false })
    window.addEventListener('keyup', up)
    window.addEventListener('blur', clear)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', clear)
      held.current.clear()
    }
  }, [enabled])

  useEffect(() => {
    if (!enabled) return

    let frame = 0
    let last = performance.now()

    const step = (now: number) => {
      // Capped so a backgrounded tab does not resume by teleporting across the
      // room on one enormous delta.
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now

      let dx = 0
      let dy = 0
      for (const code of held.current) {
        const vector = KEYS[code]
        if (vector) {
          dx += vector[0]
          dy += vector[1]
        }
      }

      // A drag pulls toward the touch point and stops on arrival, so a tap is
      // "walk here" and a held drag is a joystick, with no on-screen stick.
      if (target.current) {
        const toX = target.current.x - current.current.x
        const toY = target.current.y - current.current.y
        const distance = Math.hypot(toX, toY)
        if (distance > 8) {
          dx += toX / distance
          dy += toY / distance
        } else {
          target.current = null
        }
      }

      const length = Math.hypot(dx, dy)
      if (length > 0) {
        // Normalised, so walking diagonally is not faster than walking straight.
        const moved = clamp(
          current.current.x + (dx / length) * SPEED * dt,
          current.current.y + (dy / length) * SPEED * dt,
        )
        const facing: 1 | -1 = dx > 0.1 ? 1 : dx < -0.1 ? -1 : current.current.facing
        current.current = { ...moved, facing, walking: true }
        setPosition(current.current)
      } else if (current.current.walking) {
        current.current = { ...current.current, walking: false }
        setPosition(current.current)
      }

      frame = requestAnimationFrame(step)
    }

    frame = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame)
  }, [enabled])

  /** Point the character at a place on the stage. The stage calls this on drag. */
  const walkTo = (x: number, y: number) => {
    target.current = clamp(x, y)
  }

  const stopWalking = () => {
    target.current = null
  }

  // `current` is the ref the heartbeat reads. State lags a frame behind it and
  // would send yesterday's position twice a second.
  return { position, walkTo, stopWalking, current }
}
