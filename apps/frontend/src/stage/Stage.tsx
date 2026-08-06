import { useEffect, useMemo, useRef, useState } from 'react'
import type { Character } from '../character/parts'
import { CharacterFigure } from '../character/CharacterFigure'
import type { EmoteName } from '../character/emotes'
import { HORIZON, SCENES, STAGE, type SceneName, pieceSize, pieceUrl } from './scenes'

/**
 * The room everybody stands in.
 *
 * The lobby and every playable room are this one component with different
 * scenery and different chrome around it, which is why walking behaves
 * identically everywhere and why there is only one place to fix it.
 *
 * Everything is laid out in the stage's own 1600×900 units and scaled once, by a
 * single CSS transform on the wrapper. That is what lets a position mean the
 * same thing on a phone and a laptop — and it is why nothing here reads the size
 * of the window.
 */

export interface Actor {
  userId: string
  name: string
  character: Character
  x: number
  y: number
  /** -1 facing left, 1 facing right. */
  facing: 1 | -1
  walking: boolean
  emote: EmoteName | null
  /** Nobody has heard from them recently; drawn faded rather than removed. */
  away?: boolean
  isMe?: boolean
  isHost?: boolean
}

/**
 * How much bigger something at the front is than something at the back.
 *
 * Deliberately slight. Enough that a character walking forward feels like they
 * came closer; not so much that the same person changes size noticeably while
 * crossing the room.
 */
function depthScale(y: number): number {
  const t = Math.min(1, Math.max(0, (y - HORIZON) / (STAGE[1] - HORIZON)))
  return 0.86 + t * 0.26
}

/**
 * A character's height at the back of the stage, before depth scaling.
 *
 * Set against the furniture rather than picked: a person has to read as clearly
 * taller than the armchair they are standing next to, or the room looks like a
 * doll's house. The first pass had them the same height as the sofa.
 */
const ACTOR_HEIGHT = 430

export function Stage({
  scene,
  actors,
  onWalkTo,
  onWalkEnd,
  world,
  waterline,
  children,
}: {
  scene: SceneName
  actors: Actor[]
  /** A place on the stage was pointed at, in stage units. */
  onWalkTo?: (x: number, y: number) => void
  onWalkEnd?: () => void
  /**
   * Drawn **inside** the stage's own 1600×900 space, so it scales with
   * everything else and sorts against the players by `z-index`.
   *
   * `children` is chrome — it floats over the stage in screen pixels, which is
   * right for a panel and wrong for a lamp you have to be able to walk behind.
   * A room whose furniture changes twice a second cannot express that as a
   * `Scene`, which is a list of things that stand still.
   */
  world?: React.ReactNode
  /**
   * The stage y of a water surface, if this room has one.
   *
   * Only used to mark the actors: somebody whose feet are under it is wading,
   * somebody whose chest is under it is afloat. Doing it here rather than in
   * the room is what lets the character react — the room does not own how a
   * player is drawn, and every actor including your peers gets it for free.
   */
  waterline?: number | null
  /** Chrome drawn over the stage — the room's puzzle, the lobby's emote bar. */
  children?: React.ReactNode
}) {
  const frame = useRef<HTMLDivElement | null>(null)
  const [scale, setScale] = useState(1)
  const layout = SCENES[scene]

  // The stage is a fixed coordinate space scaled to fit its box. Measured
  // rather than guessed at a breakpoint, and measured on the *wrapper* whose
  // size never depends on the stage's own contents — so unlike the character
  // picker's first attempt, this cannot feed itself.
  useEffect(() => {
    const node = frame.current
    if (!node) return

    const observer = new ResizeObserver(([entry]) => {
      const width = entry?.contentRect.width ?? 0
      setScale(width / STAGE[0])
    })
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  // Depth is `z-index`, not DOM order — and that is a fix rather than a
  // preference. Sorting the children by `y` meant React reordered keyed nodes
  // every time a walking player crossed a prop, and **moving a DOM node
  // restarts its CSS animations**: the drop-in played again on every crossing,
  // dozens of times a minute.
  //
  // With a stable DOM order nothing is ever re-inserted, so an animation runs
  // exactly once. The stacking is identical because every layer is positioned.
  const props = useMemo(
    () => layout.props.filter((prop) => pieceSize(prop.piece) !== null),
    [layout],
  )

  // Sorted by id rather than by position, so the order is stable as people move.
  const people = useMemo(
    () => [...actors].sort((a, b) => a.userId.localeCompare(b.userId)),
    [actors],
  )

  /**
   * Pointer input, converted from screen pixels into stage units.
   *
   * One handler for mouse and touch alike, because `pointer` events already
   * unify them — and dividing by the same `scale` the stage is drawn at is what
   * makes "there" mean the same place at any window size.
   */
  const pointTo = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!onWalkTo || scale === 0) return
    const box = event.currentTarget.getBoundingClientRect()
    onWalkTo((event.clientX - box.left) / scale, (event.clientY - box.top) / scale)
  }

  return (
    <div
      ref={frame}
      /* The stage is a piece, and so is every prop inside it — so the room
         arrives as a room while its furniture flies into place within it. The
         transforms compound, which is the same two-layer parallax the panels
         and their controls get (ADR-0044).

         The wall and the floor stay out of it deliberately: they are the room
         rather than things in it, and a room whose walls fly in has nothing left
         for the furniture to arrive into. */
      data-piece=""
      className="stage-frame"
      onPointerDown={(event) => {
        // Only a primary press, so a right-click or a second finger does not
        // send the character somewhere unexpected.
        if (event.button !== 0) return
        event.currentTarget.setPointerCapture(event.pointerId)
        pointTo(event)
      }}
      onPointerMove={(event) => {
        if (event.buttons !== 1) return
        pointTo(event)
      }}
      onPointerUp={() => onWalkEnd?.()}
      onPointerCancel={() => onWalkEnd?.()}
    >
      <div
        className="stage"
        style={{
          width: STAGE[0],
          height: STAGE[1],
          transform: `scale(${scale})`,
        }}
      >
        {/* Wall and floor are surfaces rather than objects: always at the back,
            never sorted, stretched to span the stage. */}
        <img className="stage-wall" src={pieceUrl(layout.wall)} alt="" draggable={false} />
        <img className="stage-floor" src={pieceUrl(layout.floor)} alt="" draggable={false} />

        {props.map((prop) => {
          const size = pieceSize(prop.piece)!
          return (
            <img
              key={`${prop.piece}-${prop.x}-${prop.y}`}
              src={pieceUrl(prop.piece)}
              alt=""
              draggable={false}
              data-sway={prop.sway}
              /* Every piece of scenery flies in on its own, so the room builds
                 itself rather than being there when you arrive. The characters
                 already did this — `.stage-actor` has `drop-in` — which is what
                 made the furniture standing still look wrong beside them.

                 The frame is a piece too, so the stage arrives as a stage *and*
                 its contents arrive within it. The transforms compound, which is
                 the same two-layer parallax the panels and their controls get
                 (ADR-0044). */
              data-piece=""
              className="stage-prop"
              style={{
                left: prop.x - size.w / 2,
                top: prop.y - size.h,
                width: size.w,
                height: size.h,
                // `depth` where a piece has one, otherwise its ground line. A
                // rug lies flat: it is at the front of the room but must draw
                // behind anybody standing on it.
                zIndex: Math.round(prop.depth ?? prop.y),
                transform: prop.flip ? 'scaleX(-1)' : undefined,
              }}
            />
          )
        })}

        {world}

        {people.map((actor) => {
          const height = ACTOR_HEIGHT * depthScale(actor.y)

          // Wading, then afloat. Measured against this actor's own height, so
          // somebody at the front of the stage — who is drawn bigger — goes
          // under a little later than somebody at the back, which is what makes
          // the depth of the room read as depth of water.
          const wet = waterline != null && waterline < actor.y
          const afloat = waterline != null && waterline < actor.y - height * 0.45

          return (
            <div
              key={actor.userId}
              data-actor={actor.userId}
              data-me={actor.isMe ? '' : undefined}
              data-away={actor.away ? '' : undefined}
              data-wet={wet ? '' : undefined}
              data-afloat={afloat ? '' : undefined}
              className="stage-actor"
              style={{
                left: actor.x,
                top: actor.y,
                zIndex: Math.round(actor.y),
                // Placed by the feet, like the props — which is what puts a
                // player and a chair on the same ground line.
                transform: `translate(-50%, -100%) scaleX(${actor.facing})`,
              }}
            >
              <CharacterFigure
                character={actor.character}
                emote={actor.emote}
                walking={actor.walking}
                style={{ height }}
              />
              <span className="stage-nameplate" style={{ transform: `scaleX(${actor.facing})` }}>
                {actor.isHost && <span aria-hidden="true">♛ </span>}
                {actor.name}
              </span>
            </div>
          )
        })}
      </div>

      {children && <div className="stage-chrome">{children}</div>}
    </div>
  )
}
