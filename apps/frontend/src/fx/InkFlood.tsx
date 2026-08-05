import { useEffect, useRef } from 'react'
import { play } from '../audio/sfx'

/**
 * The transition: the page's two inks flood the screen and drain away.
 *
 * The background of every page is already two ink fields under a halftone
 * screen (ADR-0032). This takes them literally — dozens of bubbles of the same
 * two inks bloom out, swallow the screen, hold for a beat, then shrink away to
 * reveal whatever is underneath.
 *
 * Canvas rather than CSS for one specific reason: it is sixty overlapping
 * shapes with a dot screen over the top, and the character pipeline already
 * proved that the screen is exactly what stops this reading as a gradient. A
 * pile of animated `div`s would be smooth, and smooth is the thing that looks
 * machine-made.
 */

const INK_A = '#e8452e'
const INK_B = '#0b7fbf'
const PAPER = '#ede7d6'

const BUBBLES = 64
const FLOOD_MS = 460
const HOLD_MS = 180
const DRAIN_MS = 380
const TOTAL_MS = FLOOD_MS + HOLD_MS + DRAIN_MS

interface Bubble {
  x: number
  y: number
  r: number
  ink: string
  /** Staggers the bloom so they do not all arrive as one disc. */
  delay: number
}

export function InkFlood({ onCovered, onDone }: { onCovered?: () => void; onDone: () => void }) {
  const canvas = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const node = canvas.current
    if (!node) return

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduced) {
      // The route change is what matters; the spectacle is not. Still hands
      // over at the same two moments so the caller needs no special case.
      onCovered?.()
      const timer = window.setTimeout(onDone, 120)
      return () => window.clearTimeout(timer)
    }

    play('whoosh')

    const dpr = Math.min(2, window.devicePixelRatio || 1)
    const width = window.innerWidth
    const height = window.innerHeight
    node.width = width * dpr
    node.height = height * dpr
    node.style.width = `${width}px`
    node.style.height = `${height}px`

    const ctx = node.getContext('2d')
    if (!ctx) {
      onDone()
      return
    }
    ctx.scale(dpr, dpr)

    // Reach is measured to the far corner so the bubbles genuinely cover the
    // screen rather than nearly covering it and leaving paper in the corners.
    const reach = Math.hypot(width, height)

    const bubbles: Bubble[] = Array.from({ length: BUBBLES }, (_, index) => ({
      x: Math.random() * width,
      y: Math.random() * height,
      r: reach * (0.22 + Math.random() * 0.3),
      ink: index % 2 === 0 ? INK_A : INK_B,
      delay: Math.random() * 0.45,
    }))

    let frame = 0
    let covered = false
    const started = performance.now()

    const draw = (now: number) => {
      const elapsed = now - started
      ctx.clearRect(0, 0, width, height)

      const flooding = elapsed < FLOOD_MS + HOLD_MS
      const t = flooding
        ? Math.min(1, elapsed / FLOOD_MS)
        : 1 - Math.min(1, (elapsed - FLOOD_MS - HOLD_MS) / DRAIN_MS)

      // Paper first, so the inks have something to be printed on rather than
      // fading in over the page behind.
      ctx.globalAlpha = Math.min(1, t * 1.6)
      ctx.fillStyle = PAPER
      ctx.fillRect(0, 0, width, height)

      ctx.globalCompositeOperation = 'multiply'
      for (const bubble of bubbles) {
        // Eased per bubble, and each starts a little later than the last.
        const local = Math.min(1, Math.max(0, (t - bubble.delay) / (1 - bubble.delay)))
        const eased = 1 - Math.pow(1 - local, 3)
        if (eased <= 0) continue

        ctx.globalAlpha = 0.55
        ctx.fillStyle = bubble.ink
        ctx.beginPath()
        ctx.arc(bubble.x, bubble.y, bubble.r * eased, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.globalCompositeOperation = 'source-over'
      ctx.globalAlpha = 1

      // The halftone, laid over the whole thing at the end — the same screen
      // every generated asset carries, which is what ties this to the artwork.
      if (t > 0.05) {
        ctx.fillStyle = 'rgba(24,22,15,0.16)'
        for (let y = 0; y < height; y += 6) {
          for (let x = 0; x < width; x += 6) {
            ctx.fillRect(x, y, 1.4, 1.4)
          }
        }
      }

      // Handed over at full cover, so the screen underneath changes while
      // nobody can see it change.
      if (!covered && elapsed >= FLOOD_MS) {
        covered = true
        onCovered?.()
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

  return <canvas ref={canvas} className="ink-flood" aria-hidden="true" />
}
