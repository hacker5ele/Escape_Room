import { useEffect, useRef } from 'react'
import type { ReactElement } from 'react'
import { CORRIDOR_SPHINX_PALETTE, drawSphinx, type SphinxPalette } from './creatures'
import type { AtmosphereStage } from './corridor'

// The room's small HUD/overlay pieces, together in one module purely to cut
// down the room's file count — each is its own self-contained component
// with no shared state between them.

/** A draining-sand countdown, rendered as a simple SVG hourglass. */
export function Hourglass({ fraction }: { fraction: number }) {
  const clamped = Math.max(0, Math.min(1, fraction))
  const topHeight = 26 * clamped
  const bottomHeight = 26 * (1 - clamped)

  return (
    <svg width="28" height="40" viewBox="0 0 28 40" aria-hidden="true">
      <path
        d="M4 2 H24 L15 20 L24 38 H4 L13 20 Z"
        fill="none"
        stroke="rgba(232, 176, 75, 0.5)"
        strokeWidth="1.5"
      />
      <clipPath id="sphinx-hourglass-top">
        <path d="M6 4 H22 L14 19 H14 Z" />
      </clipPath>
      <clipPath id="sphinx-hourglass-bottom">
        <path d="M14 21 H14 L22 36 H6 Z" />
      </clipPath>
      <rect x="6" y={19 - topHeight} width="16" height={topHeight} fill="#e8b04b" clipPath="url(#sphinx-hourglass-top)" />
      <rect x="6" y={36 - bottomHeight} width="16" height={bottomHeight} fill="#e8b04b" clipPath="url(#sphinx-hourglass-bottom)" />
    </svg>
  )
}

/**
 * The shared 3-hearts strip — one pool spanning both the Sphinx corridor and
 * the Atlantis quest that follows it (see ADR-0023). Full hearts glow
 * amber/gold to match whichever half of the room is active; lost hearts sit
 * as a dim outline so the player can see exactly how much room for error is
 * left without it feeling like a second, separate counter.
 */
export function HeartsHud({ hearts, maxHearts, tone = 'amber' }: { hearts: number; maxHearts: number; tone?: 'amber' | 'gold' }) {
  const color = tone === 'gold' ? '#e8c964' : '#f5d99a'
  const dim = tone === 'gold' ? 'rgba(232, 201, 100, 0.25)' : 'rgba(232, 176, 75, 0.25)'

  return (
    <div className="sphinx-hearts" role="status" aria-label={`${hearts} of ${maxHearts} hearts remaining`}>
      {Array.from({ length: maxHearts }, (_, i) => {
        const filled = i < hearts
        return (
          <svg key={i} width="18" height="18" viewBox="0 0 32 32" aria-hidden="true" className="sphinx-heart">
            <path
              d="M16 28C7 21 3 15.5 3 10.8 3 6.5 6.4 3 10.6 3c2.4 0 4.6 1.2 5.4 3 0.8-1.8 3-3 5.4-3C25.6 3 29 6.5 29 10.8 29 15.5 25 21 16 28Z"
              fill={filled ? color : 'none'}
              stroke={filled ? color : dim}
              strokeWidth="2"
            />
          </svg>
        )
      })}
    </div>
  )
}

const PORTRAIT_WIDTH = 260
const PORTRAIT_HEIGHT = 210

/**
 * A close-up of the same Sphinx model used in the world (creatures.ts's
 * drawSphinx), used for the dialogue's reaction shots: a wrong answer, and
 * (with the gold palette) the final congratulations in the ending chamber.
 */
export function Portrait({
  posture,
  eyeGlow,
  awake,
  palette = CORRIDOR_SPHINX_PALETTE,
}: {
  posture: AtmosphereStage['sphinxPosture']
  eyeGlow: string
  awake: boolean
  palette?: SphinxPalette
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context) return
    const ctx: CanvasRenderingContext2D = context

    let raf: number
    function frame(time: number) {
      ctx.clearRect(0, 0, PORTRAIT_WIDTH, PORTRAIT_HEIGHT)
      ctx.save()
      // The realistic Sphinx is a low body with a small head near the front
      // — a portrait crops in on the head/chest rather than trying to fit
      // the whole silhouette, the way a camera would frame a face.
      // drawSphinx's `x` now centers the statue's whole footprint; the head
      // itself sits ~48px right of that footprint center at scale 1, so
      // shift the draw origin left by that much to bring the head (not the
      // footprint) to the middle of the portrait.
      //
      // Vertically, drawSphinx draws everything as negative-y offsets from
      // `groundY` (passed as 0 here) — the crown of the headdress is the
      // highest point, landing as far as ~-170 design-space px above that
      // ground line at the largest ('looming') scale. A translate of just
      // 60 left the whole head permanently off the top of the canvas for
      // every posture, not only looming — this pushes the ground line low
      // enough that the crown clears the top edge with margin at every
      // posture, confirmed against drawSphinx's actual scale/headSize math.
      const portraitScale = 1.1
      ctx.translate(0, 210)
      ctx.scale(portraitScale, portraitScale)
      drawSphinx(ctx, PORTRAIT_WIDTH * 0.5 / portraitScale - 48, 0, posture, eyeGlow, awake, time, palette)
      ctx.restore()
      raf = window.requestAnimationFrame(frame)
    }
    raf = window.requestAnimationFrame(frame)
    return () => window.cancelAnimationFrame(raf)
  }, [posture, eyeGlow, awake, palette])

  return (
    <canvas
      ref={canvasRef}
      width={PORTRAIT_WIDTH}
      height={PORTRAIT_HEIGHT}
      className="sphinx-portrait"
      aria-hidden="true"
    />
  )
}

/**
 * Five simple hieroglyph-style glyphs across the top of the chamber, one per
 * riddle. Unsolved glyphs sit dim; solved ones light up amber — a permanent,
 * at-a-glance progress strip that doesn't require reading torch counts.
 */
const GLYPHS: readonly ((props: { color: string }) => ReactElement)[] = [
  // Eye (shadow riddle)
  ({ color }) => (
    <path
      d="M2 12c3-5 8-8 14-8s11 3 14 8c-3 5-8 8-14 8s-11-3-14-8Z M16 8a4 4 0 100 8 4 4 0 000-8Z"
      fill={color}
      fillRule="evenodd"
    />
  ),
  // Spiral ripple (echo riddle)
  ({ color }) => (
    <path
      d="M16 4a12 12 0 100 24 9 9 0 100-18 6 6 0 100 12 3 3 0 100-6"
      fill="none"
      stroke={color}
      strokeWidth="2.4"
      strokeLinecap="round"
    />
  ),
  // Empty scroll (silence riddle)
  ({ color }) => (
    <path
      d="M8 5h16a2 2 0 012 2v18a2 2 0 01-2 2H8a2 2 0 01-2-2V7a2 2 0 012-2Z M10 11h12M10 16h12M10 21h8"
      fill="none"
      stroke={color}
      strokeWidth="2.2"
      strokeLinecap="round"
    />
  ),
  // Ankh (time riddle)
  ({ color }) => (
    <path
      d="M16 4a5 5 0 015 5 5 5 0 01-10 0 5 5 0 015-5Z M16 14v16 M9 20h14"
      fill="none"
      stroke={color}
      strokeWidth="2.4"
      strokeLinecap="round"
    />
  ),
  // Scarab (death/rebirth riddle)
  ({ color }) => (
    <path
      d="M16 9a6 6 0 00-6 6v4a6 6 0 0012 0v-4a6 6 0 00-6-6Z M16 5v4 M10 13l-4-2 M22 13l4-2 M10 20l-4 2 M22 20l4 2"
      fill="none"
      stroke={color}
      strokeWidth="2.2"
      strokeLinecap="round"
    />
  ),
]

export function HieroglyphHud({ solvedCount, activeIndex }: { solvedCount: number; activeIndex: number | null }) {
  return (
    <div className="sphinx-hud">
      {GLYPHS.map((Glyph, i) => {
        const solved = i < solvedCount
        const active = activeIndex === i
        return (
          <div key={i} className={`sphinx-hud-tile ${solved ? 'sphinx-hud-tile--lit' : ''} ${active ? 'sphinx-hud-tile--active' : ''}`}>
            <svg width="20" height="20" viewBox="0 0 32 32" aria-hidden="true">
              <Glyph color={solved ? '#f5d99a' : 'rgba(232, 176, 75, 0.3)'} />
            </svg>
          </div>
        )
      })}
    </div>
  )
}
