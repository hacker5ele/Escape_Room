import { floodLine, pieceSize, pieceUrl } from '../../stage/scenes'
import type { Actor } from '../../stage/Stage'
import { Water } from './Water'
import type { Interaction } from './actions'
import type { HallDetail, HallLayout, Spot } from './state'

/**
 * The hall's working parts, drawn in the stage's own coordinates.
 *
 * Everything here sorts against the players by `z-index`, which is what lets
 * you walk behind a lamp and stand in front of a pedestal. It is separate from
 * the scene in `scenes.ts` for one reason: a `Scene` is a list of things that
 * stand still, and every object in this file changes twice a second.
 *
 * Nothing in here is clickable. A station shows you it is *reachable* — the
 * ring — and the words for what E would do live down in the chrome, where they
 * are still legible when the whole stage has been scaled to a phone.
 */

export function HallWorld({
  layout,
  detail,
  act,
  depth,
  actors,
  offer,
}: {
  layout: HallLayout
  detail: HallDetail
  act: number
  depth: number
  actors: Actor[]
  /** What the room is currently offering, so the station in question can say so. */
  offer: Interaction | null
}) {
  const lit = offer?.station.id ?? null

  return (
    <>
      {/* The channel the hall opens down the middle for two players. Under
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

      {/* The order act two wants, painted up the depth staff. It has been on the
          wire since the room shipped and was never drawn, which made the order
          impossible to learn anywhere inside the hall. */}
      {detail.order && (
        <div className="hall-staff" style={{ left: 150, top: 660, zIndex: 600 }}>
          {detail.order.map((tabletId, index) => (
            <span className="hall-staff-mark" key={tabletId}>
              <b>{index + 1}</b>
              <Piece piece={tabletPiece(tabletId)} className="hall-staff-tablet" />
            </span>
          ))}
        </div>
      )}

      {/* Act three alone: the pattern stamped on the gearbox. Together, this is
          null and the two plaques on the wheels carry it instead. */}
      {detail.sequence && (
        <div className="hall-pattern" style={{ left: 1465, top: 430, zIndex: 600 }}>
          {detail.sequence.map((turn, index) => (
            <span
              key={index}
              className="hall-pattern-step"
              data-done={index < detail.step ? '' : undefined}
              data-side={turn.wheel === 'wheel-west' ? 'west' : 'east'}
            >
              {turn.wheel === 'wheel-west' ? 'W' : 'E'}
              {turn.dir === 1 ? '▶' : '◀'}
            </span>
          ))}
        </div>
      )}

      {layout.wheels.map((wheel) => (
        <Station key={wheel.id} spot={wheel} lit={lit === wheel.id}>
          <Piece
            piece={wheel.id === 'wheel-west' ? 'hall-wheel-west' : 'hall-wheel-east'}
            className="hall-wheel"
            data-running={(detail.wheels[wheel.id] ?? 0) > 0 ? '' : undefined}
          />
          {act === 3 && signFor(detail, wheel.id) !== null && (
            <Piece
              piece={signFor(detail, wheel.id) === 1 ? 'hall-sign-turn-a' : 'hall-sign-turn-b'}
              className="hall-sign"
            />
          )}
        </Station>
      ))}

      {act === 4 &&
        layout.winches.map((winch) => (
          <Station key={winch.id} spot={winch} lit={lit === winch.id}>
            <Piece piece="hall-winch" className="hall-winch" data-winding={detail.wound > 0 ? '' : undefined} />
          </Station>
        ))}

      {/* The gate comes down over the inflow while it is being wound shut, so
          the act has something visible to be about. */}
      {(act === 4 || detail.gateShut) && (
        <div className="hall-gatehouse" style={{ left: 800, top: 560, zIndex: 555 }}>
          <img
            src={pieceUrl('hall-gate')}
            alt=""
            draggable={false}
            style={{ translate: `0 ${-260 + detail.wound * 260}px` }}
          />
        </div>
      )}

      {act === 1 &&
        layout.lamps.map((lamp) => {
          const left = detail.lamps[lamp.id] ?? 0
          const wanted = detail.pair?.includes(lamp.id) ?? false
          return (
            <Station key={lamp.id} spot={lamp} lit={lit === lamp.id} wanted={wanted}>
              <Piece
                piece={left > 0 ? 'hall-lamp-lit' : 'hall-lamp-out'}
                className="hall-lamp"
                data-lit={left > 0 ? '' : undefined}
              />
              {/* How long it has left, as a ring burning down. Without this
                  "all five at once" is a rule you can only learn by failing. */}
              {left > 0 && (
                <span
                  className="hall-burn"
                  style={{ '--burn': left / detail.lampLife } as React.CSSProperties}
                />
              )}
            </Station>
          )
        })}

      {act === 2 && (
        <>
          {layout.pedestals.map((pedestal, index) => (
            <Station
              key={pedestal.id}
              spot={pedestal}
              lit={lit === pedestal.id}
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
              <Station key={tablet.id} spot={tablet} lit={lit === tablet.id}>
                <Piece piece={tabletPiece(tablet.id)} className="hall-tablet" />
              </Station>
            ))}

          {/* A carried tablet rides its carrier — which is how you can see, from
              the other end of the room, what your partner is holding. */}
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

      {act >= 5 && (
        <Station spot={layout.keypad} lit={lit === layout.keypad.id}>
          <Piece
            piece="hall-keypad"
            className="hall-keypad"
            data-drowned={detail.keypadDrowned ? '' : undefined}
          />
        </Station>
      )}

      {/* What everybody is saying, over their own head. Your friend lights a
          lamp at the far end and you see them say so — which is most of what
          makes a room with two people in it feel like a room with two people
          in it. */}
      {Object.entries(detail.says).map(([userId, words]) => {
        const who = actors.find((actor) => actor.userId === userId)
        if (!who) return null
        return (
          <div
            key={`says-${userId}-${words}`}
            className="hall-spot hall-balloon-at"
            style={{ left: who.x, top: who.y - 430, zIndex: Math.round(who.y) + 2 }}
          >
            <span className="hall-balloon">{words}</span>
          </div>
        )
      })}

      <Water surface={floodLine(depth)} depth={depth} />
    </>
  )
}

/**
 * A thing you can work, drawn where it stands.
 *
 * The ring is the room answering the character: it closes when you are near
 * enough for E to mean this, and `wanted` marks the one the hall is asking for
 * specifically — the named lamp, the next pedestal in the row — which is drawn
 * whether or not you are near it, because half the point is that your partner
 * can see which one you need.
 */
function Station({
  spot,
  lit,
  wanted = false,
  children,
}: {
  spot: Spot
  lit: boolean
  wanted?: boolean
  children: React.ReactNode
}) {
  return (
    <div
      className="hall-spot"
      data-near={lit ? '' : undefined}
      data-wanted={wanted ? '' : undefined}
      style={{ left: spot.x, top: spot.y, zIndex: Math.round(spot.y) }}
    >
      <span className="hall-ring" />
      {children}
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
