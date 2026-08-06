import { useMemo, useState } from 'react'
import type { RoomProps } from './registry'
import { HallWorld } from './hall/HallWorld'
import { Bangs, Caption, Fragments, TideGauge } from './hall/HallChrome'
import { readDetail, readLayout } from './hall/state'

/**
 * Room 1 — The Reading Hall, below the harbour, filling up.
 *
 * **The room is a place, not a question.** Everything in it is done by walking
 * somewhere and stopping: the lamps light because you are standing at them, the
 * tablets are carried because you picked them up by standing on them, the
 * wheels pump because somebody is at them. The only thing anybody types in the
 * whole hall is the six figures at the end.
 *
 * That is not a stylistic choice, it is what makes the co-op work for free.
 * Everybody's position has been on the heartbeat twice a second since the stage
 * was built (ADR-0038), so a second player needs no new message, no new
 * endpoint and no new state — they are another set of coordinates in the same
 * list, and the mechanism can simply ask whether two of them are in two places
 * at once.
 *
 * **The hall counts you**, and changes shape on the answer. What one person can
 * work alone, two people have to work together: the lamps stop taking a flame
 * singly, the floor opens down the middle, and the plaque telling you which way
 * to turn moves to the other end of the room. See ADR-0048.
 *
 * The water is owned by the server and arrives on the same beat. It is the
 * clock, the enemy and the gate at once, which is why there is no countdown
 * anywhere on this screen.
 */

export function RoomOne({ room, onAnswer, busy, live }: RoomProps) {
  const [code, setCode] = useState('')
  const detail = useMemo(() => readDetail(live), [live])

  const act = live?.act ?? 1
  const drowning = (live?.depth ?? 0) > 78

  return (
    <div className="hall-chrome" data-drowning={drowning ? '' : undefined}>
      <Bangs flash={detail.flash} />

      <Caption act={act} counted={live?.counted ?? 1} detail={detail} depth={live?.depth ?? 0} />

      <div className="hall-readouts">
        <TideGauge depth={live?.depth ?? 0} trend={live?.trend ?? 'rising'} />
        <Fragments fragments={detail.fragments} />
      </div>

      {/* The vault only appears once the three acts have given up their figures,
          and it will not take a code with its dial under water. That last part
          is the room's whole endgame with a friend in it: somebody has to stay
          on a wheel at the far end while somebody else stands here and types. */}
      {act >= 4 && (
        <form
          className="hall-vault pointer-events-auto"
          data-piece=""
          onSubmit={(event) => {
            event.preventDefault()
            onAnswer(code)
          }}
        >
          <label className="hall-gauge-label" htmlFor="hall-code">
            {detail.keypadDrowned ? 'THE DIAL IS UNDER WATER' : 'SET THE DIAL'}
          </label>
          <div className="hall-vault-row">
            <input
              id="hall-code"
              className="field hall-code"
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
              disabled={busy || detail.keypadDrowned}
              inputMode="numeric"
              autoComplete="off"
              placeholder="······"
              aria-label="The six figures"
            />
            <button type="submit" className="btn" disabled={busy || detail.keypadDrowned}>
              Open it
            </button>
          </div>
          <p className="hall-vault-note">{room.prompt}</p>
        </form>
      )}
    </div>
  )
}

/**
 * The half of the room that lives *inside* the stage.
 *
 * Separate from the panel above because it is drawn in the stage's own 1600×900
 * units and sorted against the players by `z-index` — which is what lets you
 * walk behind a lamp, stand in front of a pedestal, and watch the water close
 * over your knees. A panel cannot do any of that; it floats in screen pixels.
 */
export function HallWorldFor({ room, live, actors }: RoomProps) {
  const layout = useMemo(() => readLayout(room.data), [room.data])
  const detail = useMemo(() => readDetail(live), [live])

  const me = actors.find((actor) => actor.isMe)
  if (!layout) return null

  return (
    <HallWorld
      layout={layout}
      detail={detail}
      act={live?.act ?? 1}
      depth={live?.depth ?? 0}
      actors={actors}
      me={{ x: me?.x ?? 0, y: me?.y ?? 0 }}
    />
  )
}
