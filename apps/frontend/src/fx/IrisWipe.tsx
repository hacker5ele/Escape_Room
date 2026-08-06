import { useEffect, useRef } from 'react'
import { play } from '../audio/sfx'

/**
 * The iris wipe — the cartoon transition.
 *
 * A circle closes down to a point, holds, and opens again on the next scene.
 * This is *the* 1950s cartoon transition, the one every short ends on, and it
 * belongs here for the same reason the halftone does: it is what the era
 * actually did rather than a modern effect wearing period colours.
 *
 * Three things make it read as drawn rather than as a mask animating:
 *
 * **It overshoots.** The iris shrinks past its mark, pops back, then closes —
 * anticipation and settle, the whole cartoon vocabulary in one easing curve. A
 * linear close is a wipe; an overshooting one is animation.
 *
 * **The rim is inked.** A ring of key with a halftone screen inside it, so the
 * closing edge looks printed rather than like a clipping path.
 *
 * **It wobbles.** The circle is drawn as a slightly irregular polygon that
 * breathes, because a mathematically perfect circle is the giveaway that a
 * machine drew it.
 *
 * A slide whistle falls as it closes and rises as it opens, which is the sound
 * the gesture has had since 1940.
 */

const KEY = '#18160f'
const INK_A = '#e8452e'
const INK_B = '#0b7fbf'

const CLOSE_MS = 520
const HOLD_MS = 140
const OPEN_MS = 460
const TOTAL_MS = CLOSE_MS + HOLD_MS + OPEN_MS

/** Overshoot on the way in: past the mark, back, then shut. */
function easeClose(t: number): number {
  // A back-ease. The 1.9 is how far past it goes — enough to see, not so much
  // that the iris visibly bounces off the edge of the screen.
  const c = 1.9
  return 1 + c * Math.pow(t - 1, 3) + (c - 0.4) * Math.pow(t - 1, 2)
}

/** And a softer settle on the way out, so the new scene arrives rather than snaps. */
function easeOpen(t: number): number {
  return 1 - Math.pow(1 - t, 3)
}

export function IrisWipe({ onCovered, onDone }: { onCovered?: () => void; onDone: () => void }) {
  const canvas = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const node = canvas.current
    if (!node) return

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      // The scene change is what matters; the flourish is not. Handed over at
      // the same two moments so the caller needs no special case.
      onCovered?.()
      const timer = window.setTimeout(onDone, 120)
      return () => window.clearTimeout(timer)
    }

    play('slide')

    const dpr = Math.min(2, window.devicePixelRatio || 1)
    const width = window.innerWidth
    const height = window.innerHeight
    node.width = width * dpr
    node.height = height * dpr
    node.style.width = `${width}px`
    node.style.height = `${height}px`

    const ctx = node.getContext('2d')
    if (!ctx) {
      onCovered?.()
      onDone()
      return
    }
    ctx.scale(dpr, dpr)

    // Measured to the far corner, so the iris genuinely starts off-screen
    // rather than appearing as a circle already on the page.
    const cx = width / 2
    const cy = height / 2
    const full = Math.hypot(width, height) / 2

    let frame = 0
    let covered = false
    let whistled = false
    const started = performance.now()

    /** The iris outline: a circle with a slow wobble, drawn as a polygon. */
    const irisPath = (radius: number, phase: number) => {
      ctx.beginPath()
      const points = 72
      for (let i = 0; i <= points; i += 1) {
        const angle = (i / points) * Math.PI * 2
        // Three overlapping frequencies, so the wobble never obviously repeats.
        const wobble =
          1 +
          Math.sin(angle * 3 + phase) * 0.012 +
          Math.sin(angle * 5 - phase * 1.4) * 0.008
        const r = radius * wobble
        const x = cx + Math.cos(angle) * r
        const y = cy + Math.sin(angle) * r
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      }
      ctx.closePath()
    }

    const draw = (now: number) => {
      const elapsed = now - started
      ctx.clearRect(0, 0, width, height)

      const closing = elapsed < CLOSE_MS
      const holding = !closing && elapsed < CLOSE_MS + HOLD_MS

      // 1 is wide open, 0 is shut.
      let openness: number
      if (closing) openness = 1 - easeClose(Math.min(1, elapsed / CLOSE_MS))
      else if (holding) openness = 0
      else openness = easeOpen(Math.min(1, (elapsed - CLOSE_MS - HOLD_MS) / OPEN_MS))

      const radius = Math.max(0, openness * full)
      const phase = elapsed / 220

      // Everything outside the iris is solid key. `evenodd` with a full-screen
      // rectangle and the iris inside it punches the hole in one fill, which is
      // both faster and cleaner than compositing two layers.
      ctx.fillStyle = KEY
      ctx.beginPath()
      ctx.rect(0, 0, width, height)
      irisPath(radius, phase)
      ctx.fill('evenodd')

      if (radius > 2) {
        // The two inks as concentric rings just inside the rim — the target
        // ring every cartoon iris has, and the only place the palette appears.
        for (const [inset, colour, alpha] of [
          [0.965, INK_A, 0.9],
          [0.93, INK_B, 0.75],
        ] as const) {
          ctx.strokeStyle = colour
          ctx.globalAlpha = alpha
          ctx.lineWidth = Math.max(2, radius * 0.02)
          irisPath(radius * inset, phase)
          ctx.stroke()
        }
        ctx.globalAlpha = 1

        // And the key outline on the rim itself, so the edge is drawn rather
        // than merely where the fill happens to stop.
        ctx.strokeStyle = KEY
        ctx.lineWidth = Math.max(3, radius * 0.012)
        irisPath(radius, phase)
        ctx.stroke()
      }

      // The halftone, over the key only — the same screen every generated asset
      // carries, which is what ties the transition to the artwork.
      ctx.save()
      ctx.beginPath()
      ctx.rect(0, 0, width, height)
      irisPath(radius, phase)
      ctx.clip('evenodd')
      ctx.fillStyle = 'rgba(246,242,230,0.10)'
      for (let y = 0; y < height; y += 6) {
        for (let x = 0; x < width; x += 6) {
          ctx.fillRect(x, y, 1.6, 1.6)
        }
      }
      ctx.restore()

      // The scene swaps at full black, so the change is never seen.
      if (!covered && elapsed >= CLOSE_MS) {
        covered = true
        onCovered?.()
      }
      // And the whistle rises again as the new scene is revealed.
      if (!whistled && elapsed >= CLOSE_MS + HOLD_MS) {
        whistled = true
        play('pop')
      }

      if (elapsed >= TOTAL_MS) {
        onDone()
        return
      }
      frame = requestAnimationFrame(draw)
    }

    frame = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(frame)
  }, [onCovered, onDone])

  return <canvas ref={canvas} className="iris-wipe" aria-hidden="true" />
}
