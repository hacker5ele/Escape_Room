import { useEffect, useRef } from 'react'
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
    { key: 'head', slot: 'head', part: head, anchor: 'neck', mirror: false, motion: null },
    { key: 'armA', slot: 'arm', part: arm, anchor: 'shoulderL', mirror: false, motion: 'arm' },
  ]
}

export function CharacterFigure({
  character,
  height,
  animated = true,
  className = '',
}: {
  character: Character
  /** Rendered height in pixels; everything scales from this. */
  height: number
  animated?: boolean
  className?: string
}) {
  const headRef = useRef<HTMLSpanElement | null>(null)
  const scale = height / FRAME[1]
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
      const shiftX = Math.max(-5, Math.min(5, dx / 60)) * scale
      const shiftY = Math.max(-4, Math.min(4, dy / 90)) * scale
      node.style.transform = `translate(${shiftX}px, ${shiftY}px) rotate(${angle}deg)`
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
  }, [animated, scale])

  return (
    <div
      className={`character ${animated ? 'character-live' : ''} ${className}`}
      style={{ width: FRAME[0] * scale, height: FRAME[1] * scale }}
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
              left: (ax - pivotX) * scale,
              top: (ay - py) * scale,
              width: part.w * scale,
              height: part.h * scale,
              transformOrigin: `${pivotX * scale}px ${py * scale}px`,
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
