import { floodLine, pieceSize, pieceUrl } from '../../stage/scenes'
import type { Actor } from '../../stage/Stage'
import { within, type HallDetail, type HallLayout, type Spot } from './state'

/**
 * The hall's working parts, drawn in the stage's own coordinates.
 *
 * Everything here sorts against the players by `z-index`, which is what lets
 * you walk behind a lamp and stand in front of a pedestal. It is separate from
 * the scene in `scenes.ts` for one reason: a `Scene` is a list of things that
 * stand still, and every object in this file changes twice a second.
 *
 * **Nothing in here is clickable.** A station reacts to a character being near
 * it and works when that character stops. That is the whole input scheme of the
 * room, and it is why a second player needs no extra machinery at all — they
 * are just another set of coordinates in the same list.
 */

/** Water draws over everything, because everybody is *in* it rather than behind it. */
const WATER_Z = 5_000

export function HallWorld({
  layout,
  detail,
  act,
  depth,
  actors,
  me,
}: {
  layout: HallLayout
  detail: HallDetail
  act: number
  depth: number
  actors: Actor[]
  me: { x: number; y: number }
}) {
  const surface = floodLine(depth)

  return (
    <>
      {/* The channel the hall opens down the middle for two players. Drawn under
          everything, because it is a hole in the floor rather than a thing on it. */}
      {detail.channel && (
        <div
          className="hall-channel"
          style={{
            left: layout.channel.minX,
            top: 660,
            width: Math.max(0, layout.channel.maxX - layout.channel.minX),
            height: 240,
            zIndex: 650,
          }}
        />
      )}

      {layout.wheels.map((wheel) => (
        <Station key={wheel.id} spot={wheel} me={me} radius={layout.radius} active={true}>
          <Piece
            piece={wheel.id === 'wheel-west' ? 'hall-wheel-west' : 'hall-wheel-east'}
            className="hall-wheel"
            data-running={detail.wheels[wheel.id] ? '' : undefined}
          />
          {/* Act III with two players: the plaque at this end describes the
              *far* wheel. You can read what your partner has to do and not
              what you have to do, which is the entire puzzle. */}
          {act === 3 && signFor(detail, wheel.id) !== null && (
            <Piece
              piece={signFor(detail, wheel.id) === 1 ? 'hall-sign-turn-a' : 'hall-sign-turn-b'}
              className="hall-sign"
            />
          )}
        </Station>
      ))}

      {act === 1 &&
        layout.lamps.map((lamp) => (
          <Station
            key={lamp.id}
            spot={lamp}
            me={me}
            radius={layout.radius}
            active={true}
            wanted={detail.pair?.includes(lamp.id) ?? false}
          >
            <Piece
              piece={detail.lamps[lamp.id] ? 'hall-lamp-lit' : 'hall-lamp-out'}
              className="hall-lamp"
              data-lit={detail.lamps[lamp.id] ? '' : undefined}
            />
          </Station>
        ))}

      {act === 2 && (
        <>
          {layout.pedestals.map((pedestal, index) => (
            <Station
              key={pedestal.id}
              spot={pedestal}
              me={me}
              radius={layout.radius}
              active={true}
              wanted={index === detail.seated.length}
            >
              <Piece piece="hall-pedestal" className="hall-pedestal" />
              {detail.seated[index] && (
                <Piece piece={tabletPiece(detail.seated[index])} className="hall-seated" />
              )}
            </Station>
          ))}

          {layout.tablets
            .filter(
              (tablet) =>
                !detail.seated.includes(tablet.id) &&
                !Object.values(detail.carrying).includes(tablet.id),
            )
            .map((tablet) => (
              <Station key={tablet.id} spot={tablet} me={me} radius={layout.radius} active={true}>
                <Piece piece={tabletPiece(tablet.id)} className="hall-tablet" />
              </Station>
            ))}

          {/* A carried tablet rides its carrier — which is how you can see,
              from the other end of the room, what your partner is holding. */}
          {Object.entries(detail.carrying).map(([userId, tabletId]) => {
            const carrier = actors.find((actor) => actor.userId === userId)
            if (!carrier) return null
            return (
              <div
                key={`carry-${userId}`}
                className="hall-spot hall-carried"
                style={{ left: carrier.x, top: carrier.y - 210, zIndex: Math.round(carrier.y) + 1 }}
              >
                <Piece piece={tabletPiece(tabletId)} className="hall-tablet" />
              </div>
            )
          })}
        </>
      )}

      {act >= 4 && (
        <Station spot={layout.keypad} me={me} radius={layout.radius} active={!detail.keypadDrowned}>
          <Piece
            piece="hall-keypad"
            className="hall-keypad"
            data-drowned={detail.keypadDrowned ? '' : undefined}
          />
        </Station>
      )}

      <Water surface={surface} />
    </>
  )
}

/**
 * A thing you work by standing at it.
 *
 * The ring underneath is the room answering the character: it appears when you
 * are near enough to work this, and closes when you stop and it engages. That
 * feedback is the only instruction the room ever gives about how to play it.
 */
function Station({
  spot,
  me,
  radius,
  active,
  wanted = false,
  children,
}: {
  spot: Spot
  me: { x: number; y: number }
  radius: number
  active: boolean
  /** The hall is asking for this one specifically. */
  wanted?: boolean
  children: React.ReactNode
}) {
  const near = active && within(spot, me.x, me.y, radius)

  return (
    <div
      className="hall-spot"
      data-near={near ? '' : undefined}
      data-wanted={wanted ? '' : undefined}
      data-idle={active ? undefined : ''}
      style={{ left: spot.x, top: spot.y, zIndex: Math.round(spot.y) }}
    >
      <span className="hall-ring" style={{ width: radius * 2, height: radius * 0.9 }} />
      {children}
    </div>
  )
}

/**
 * The sea, as a comic draws it: a flat band of one ink, a coarser dot screen
 * than the page uses so it reads as a separate printing pass, and a drawn crest
 * along the top.
 *
 * The crest is the one piece of water worth generating. It scrolls, and it is
 * laid down twice with the second copy mirrored — a strip and its own mirror
 * tile seamlessly at both joins, which is the cheapest way to get an endless
 * waterline out of a single drawing.
 */
function Water({ surface }: { surface: number }) {
  return (
    <div className="hall-water" style={{ top: surface, zIndex: WATER_Z }}>
      {/* The crest lives above the surface line, so it needs a window of its own
          to be clipped by — four stage-widths of scrolling image would otherwise
          hang off both sides of the picture and give the page 1700px of sideways
          scroll. Clipping the water itself instead swallowed the crest whole. */}
      <div className="hall-water-crest-window">
        <div className="hall-water-crest">
          <img src={pieceUrl('hall-water-crest')} alt="" draggable={false} />
          <img src={pieceUrl('hall-water-crest')} alt="" draggable={false} data-mirrored="" />
          <img src={pieceUrl('hall-water-crest')} alt="" draggable={false} />
          <img src={pieceUrl('hall-water-crest')} alt="" draggable={false} data-mirrored="" />
        </div>
      </div>
      <div className="hall-water-body" />
    </div>
  )
}

function Piece({
  piece,
  className,
  ...rest
}: { piece: string; className?: string } & React.ImgHTMLAttributes<HTMLImageElement>) {
  const size = pieceSize(piece)
  if (!size) return null

  return (
    <img
      src={pieceUrl(piece)}
      alt=""
      draggable={false}
      className={className}
      style={{ width: size.w, height: size.h, marginLeft: -size.w / 2, marginTop: -size.h }}
      {...rest}
    />
  )
}

function tabletPiece(id: string | undefined): string {
  const letter = id?.slice(-1) ?? '0'
  const index = Number.isNaN(Number(letter)) ? 0 : Number(letter)
  return `hall-tablet-${'abcde'[index] ?? 'a'}`
}

function signFor(detail: HallDetail, wheelId: string): number | null {
  return wheelId === 'wheel-west' ? detail.signWest : detail.signEast
}
