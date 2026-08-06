import { useMemo } from 'react'
import { pieceUrl } from '../../stage/scenes'

/**
 * The sea.
 *
 * Seven layers over one generated wave strip, because one layer reads as
 * wallpaper and two read as water. The parallax between the back and front
 * crests is doing most of the work here — they are the same drawing at
 * different scales and speeds, which is how a background painter has always
 * faked depth and costs nothing but a second `<img>`.
 *
 * Everything below the crest is flat ink and a coarse dot screen rather than a
 * texture. A comic draws water with a line and a fill; a gradient-heavy
 * "realistic" sea would undo the print pipeline the whole room depends on.
 */

/** Enough bubbles to read as water, few enough to stay cheap. */
const BUBBLES = 9

export function Water({ surface, depth }: { surface: number; depth: number }) {
  // Seeded off the index rather than randomised, so a re-render — which happens
  // twice a second — never moves a bubble that is already on its way up.
  const bubbles = useMemo(
    () =>
      Array.from({ length: BUBBLES }, (_, index) => ({
        left: `${6 + ((index * 37) % 88)}%`,
        delay: `${((index * 13) % 70) / 10}s`,
        span: `${5 + ((index * 7) % 4)}s`,
        size: 8 + ((index * 5) % 14),
      })),
    [],
  )

  return (
    <div className="hall-water" style={{ top: surface, zIndex: WATER_Z }} data-deep={depth > 60 ? '' : undefined}>
      {/* The crests live above the surface line, so they get a window of their
          own to be clipped by — four stage-widths of scrolling image would
          otherwise hang off both sides and give the page sideways scroll.
          Clipping the water itself instead swallowed them whole. */}
      <div className="hall-water-crest-window">
        <div className="hall-water-crest" data-layer="back">
          <Strip />
        </div>
        <div className="hall-water-crest" data-layer="front">
          <Strip />
        </div>
      </div>

      <div className="hall-water-body">
        <span className="hall-caustic" data-band="1" />
        <span className="hall-caustic" data-band="2" />
        <span className="hall-caustic" data-band="3" />
        {bubbles.map((bubble, index) => (
          <span
            key={index}
            className="hall-bubble"
            style={{
              left: bubble.left,
              width: bubble.size,
              height: bubble.size,
              animationDelay: bubble.delay,
              animationDuration: bubble.span,
            }}
          />
        ))}
      </div>
    </div>
  )
}

/**
 * Four copies — A, mirrored, A, mirrored — so scrolling by half the width lands
 * back on the same drawing it started from. Two copies would tile but not loop:
 * the join would jump on every cycle.
 */
function Strip() {
  return (
    <>
      <img src={pieceUrl('hall-water-crest')} alt="" draggable={false} />
      <img src={pieceUrl('hall-water-crest')} alt="" draggable={false} data-mirrored="" />
      <img src={pieceUrl('hall-water-crest')} alt="" draggable={false} />
      <img src={pieceUrl('hall-water-crest')} alt="" draggable={false} data-mirrored="" />
    </>
  )
}

/** Water draws over everything, because everybody is *in* it rather than behind it. */
const WATER_Z = 5_000
