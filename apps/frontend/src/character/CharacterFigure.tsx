import { useEffect, useRef } from 'react'
import type { EmoteName } from './emotes'
import {
  FRAME,
  RIG,
  type Character,
  type Part,
  type RigPoint,
  type Slot,
  findPart,
  partUrl,
} from './parts'

/**
 * The character, assembled and alive.
 *
 * Six layers hung on the rig: two legs, two arms, a torso and a head, where the
 * two legs are one drawing used twice and so are the arms. The mirror is what
 * makes a limb swing the other way — `scaleX(-1)` applied after the rotation
 * inverts it, so both sides can share one keyframe and still counter-swing.
 *
 * Nothing here decides where anything goes. The rig points and each part's
 * pivot come from the manifest, which measured them off the finished artwork.
 */

interface Layer {
  key: string
  slot: Slot
  part: Part
  anchor: RigPoint
  mirror: boolean
  /** Which idle animation this layer runs, if any. */
  motion: 'arm' | 'leg' | 'body' | null
}

function layersFor(character: Character): Layer[] {
  const part = (slot: Slot): Part | null => findPart(slot, character[slot])

  const head = part('head')
  const body = part('body')
  const arm = part('arm')
  const leg = part('leg')
  if (!head || !body || !arm || !leg) return []

  // Back to front. One arm goes behind the torso so the figure reads as having
  // a front and a back rather than as a sticker.
  return [
    { key: 'legB', slot: 'leg', part: leg, anchor: 'hipR', mirror: true, motion: 'leg' },
    { key: 'legA', slot: 'leg', part: leg, anchor: 'hipL', mirror: false, motion: 'leg' },
    { key: 'armB', slot: 'arm', part: arm, anchor: 'shoulderR', mirror: true, motion: 'arm' },
    { key: 'body', slot: 'body', part: body, anchor: 'neck', mirror: false, motion: 'body' },
    // `chin`, not `neck` — the head hangs lower than the torso's top so it
    // overlaps and covers the vest's open neck hole. Hung at `neck` the two
    // merely abut, and the background shows through between them.
    { key: 'head', slot: 'head', part: head, anchor: 'chin', mirror: false, motion: null },
    { key: 'armA', slot: 'arm', part: arm, anchor: 'shoulderL', mirror: false, motion: 'arm' },
  ]
}

/** Percent of the frame, to four decimals — enough that nothing visibly drifts. */
const pct = (value: number, of: number) => `${((value / of) * 100).toFixed(4)}%`

export function CharacterFigure({
  character,
  animated = true,
  emote = null,
  walking = false,
  className = '',
  style,
}: {
  character: Character
  animated?: boolean
  /** The dance currently playing, or null. Drives `[data-emote]` in the CSS. */
  emote?: EmoteName | null
  /** Runs the walk cycle instead of the idle. */
  walking?: boolean
  /** Sizing from the caller — the stage sets a height and lets width follow. */
  style?: React.CSSProperties
  /**
   * Sizing is the caller's business: the figure fills the width it is given and
   * keeps the rig's aspect ratio.
   *
   * Every layer is positioned as a *percentage* of the frame rather than in
   * pixels, which is what lets this be pure CSS. The first version measured its
   * container with a ResizeObserver and set a pixel height — and that fed a
   * loop: switching slot changed the page height, which toggled the scrollbar,
   * which changed the width, which resized the figure, which changed the page
   * height again. It read as the whole window flinching on every click.
   */
  className?: string
}) {
  const headRef = useRef<HTMLSpanElement | null>(null)
  const layers = layersFor(character)

  // The head follows the pointer, written straight to the node.
  //
  // Through React state this would re-render the whole figure on every mouse
  // move; through a ref it is one style write per frame. rAF-throttled because
  // pointermove fires far faster than the screen refreshes.
  useEffect(() => {
    if (!animated) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    let frame = 0
    let pending: { x: number; y: number } | null = null

    const apply = () => {
      frame = 0
      const node = headRef.current
      if (!node || !pending) return

      const box = node.getBoundingClientRect()
      const dx = pending.x - (box.left + box.width / 2)
      const dy = pending.y - (box.top + box.height / 2)

      // Clamped hard. Past about twelve degrees a flat cut-out stops reading as
      // a turned head and starts reading as a mistake.
      const angle = Math.max(-12, Math.min(12, dx / 22))
      // Shifted as a fraction of the head's own width, so the movement stays
      // proportional at any size without the figure knowing its scale.
      const shiftX = Math.max(-3, Math.min(3, dx / 90))
      const shiftY = Math.max(-2.5, Math.min(2.5, dy / 130))
      node.style.transform = `translate(${shiftX}%, ${shiftY}%) rotate(${angle}deg)`
    }

    const onMove = (event: PointerEvent) => {
      pending = { x: event.clientX, y: event.clientY }
      if (!frame) frame = requestAnimationFrame(apply)
    }

    window.addEventListener('pointermove', onMove, { passive: true })
    return () => {
      window.removeEventListener('pointermove', onMove)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [animated])

  return (
    <div
      className={`character ${animated ? 'character-live' : ''} ${className}`}
      data-emote={emote ?? undefined}
      data-walking={walking ? '' : undefined}
      style={{ aspectRatio: `${FRAME[0]} / ${FRAME[1]}`, ...style }}
      // The figure is decoration wherever it appears beside a name; the name is
      // the accessible label. Announcing "cartoon character" adds nothing.
      aria-hidden="true"
    >
      {layers.map(({ key, slot, part, anchor, mirror, motion }) => {
        const [ax, ay] = RIG[anchor]
        const [px, py] = part.pivot
        // Mirroring flips the drawing about its own vertical centre, so the
        // pivot moves to the other side of it before anything is positioned.
        const pivotX = mirror ? part.w - px : px

        // Two elements, and it has to be two.
        //
        // The outer one is what rotates, so the idle keyframes own its
        // `transform` outright — a CSS animation overrides an inline style, so
        // a mirror written here would simply vanish the moment a limb started
        // swinging. The flip therefore lives on the inner image, about its own
        // centre, which is exactly the reflection that moves the pivot from
        // `px` to `w - px` and is why the positioning above uses `pivotX`.
        return (
          <span
            key={key}
            ref={key === 'head' ? headRef : undefined}
            data-part={key}
            data-motion={motion ?? undefined}
            // The flip lives on the inner image, so the outer element's
            // rotation is *not* mirrored and both limbs would otherwise swing
            // the same way — a march rather than a walk. This runs the far
            // side's keyframes backwards instead.
            data-mirror={mirror ? '' : undefined}
            style={{
              left: pct(ax - pivotX, FRAME[0]),
              top: pct(ay - py, FRAME[1]),
              width: pct(part.w, FRAME[0]),
              height: pct(part.h, FRAME[1]),
              // Percentages here are of the layer's own box, not the frame —
              // which is exactly what keeps a limb turning about its shoulder
              // however large the figure is drawn.
              transformOrigin: `${pct(pivotX, part.w)} ${pct(py, part.h)}`,
            }}
          >
            <img
              src={partUrl(slot, part.id)}
              alt=""
              draggable={false}
              style={mirror ? { transform: 'scaleX(-1)' } : undefined}
            />
          </span>
        )
      })}
    </div>
  )
}
