import { useEffect, useMemo, useState } from 'react'
import type { RoomProps } from './registry'
import { HallWorld } from './hall/HallWorld'
import { Bangs, Caption, Fragments, TideGauge } from './hall/HallChrome'
import { Prompt } from './hall/Prompt'
import { Vault } from './hall/Vault'
import { offeredAt, type Interaction } from './hall/actions'
import { readDetail, readLayout, within, type HallLayout } from './hall/state'
import { isTypingTarget } from '../stage/useMovement'
import { play } from '../audio/sfx'
import { useEvent } from '../ui/useEvent'

/**
 * Room 1 — The Reading Hall, below the harbour, filling up.
 *
 * **Walk up to a thing and press E.** An earlier version of this room had
 * standing on a station *be* the action, which was elegant and completely mute:
 * you walked into a lamp and it lit with no warning, and you could walk past
 * the vault without ever learning it was the vault. A room with five acts in it
 * has to be able to say what its mechanisms are.
 *
 * Everything else about how it plays is unchanged, and the co-op still costs
 * nothing: positions have been on the heartbeat twice a second since ADR-0038,
 * so a second player is another set of coordinates in the same list. What
 * pressing E added is one field for the presses and one for what somebody has
 * hold of — see ADR-0049.
 *
 * **The hall counts you**, and changes shape on the answer. What one person can
 * work alone, two people have to work together.
 */

export function RoomOne({ room, onAnswer, busy, live, actors, onAct, onHold, holding }: RoomProps) {
  const [atVault, setAtVault] = useState(false)
  const detail = useMemo(() => readDetail(live), [live])
  const layout = useMemo(() => readLayout(room.data), [room.data])

  const act = live?.act ?? 1
  const depth = live?.depth ?? 0
  const me = actors.find((actor) => actor.isMe)
  const offer = useOffer(act, detail, layout, me, holding)

  // Walking out of reach lets go of whatever you had. Without this you could
  // wander the hall pumping a wheel from the far side of the room — the server
  // refuses it, so the only thing it would actually break is your own belief
  // about what is happening.
  const release = useEvent(() => onHold(null))
  useEffect(() => {
    if (!holding || !layout || !me) return
    const station = [...layout.wheels, ...layout.winches].find((one) => one.id === holding)
    if (station && !within(station, me.x, me.y, layout.radius)) release()
  }, [holding, layout, me, release])

  const fire = useEvent(() => {
    if (!offer) return

    if (offer.kind === 'open') {
      setAtVault(true)
      play('pop')
      return
    }
    if (offer.kind === 'release') {
      onHold(null)
      play('click')
      return
    }
    if (offer.kind === 'hold') {
      onHold(offer.station.id)
      // Taking hold of a wheel is also *turning* it, which is what act three
      // wants. Every other act ignores the press, so one key does both jobs
      // rather than the room needing a second one for pumping.
      onAct(offer.station.id)
      play('click')
      return
    }

    onAct(offer.station.id)
    play('pop')
  })

  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (event.code !== 'KeyE' || event.repeat) return
      // The same guard walking uses: E is a letter before it is a control, and
      // the vault has a text field in it.
      if (isTypingTarget(event.target)) return
      event.preventDefault()
      fire()
    }
    window.addEventListener('keydown', down)
    return () => window.removeEventListener('keydown', down)
  }, [fire])

  // Stepping away from the drums closes them, so the screen is never held open
  // over a room you are no longer standing in.
  useEffect(() => {
    if (atVault && offer?.kind !== 'open') setAtVault(false)
  }, [atVault, offer])

  const drowning = depth > 78

  return (
    <div className="hall-chrome" data-drowning={drowning ? '' : undefined}>
      <Bangs flash={detail.flash} />

      <Caption act={act} counted={live?.counted ?? 1} detail={detail} depth={depth} />

      <div className="hall-readouts">
        <TideGauge depth={depth} trend={live?.trend ?? 'rising'} shut={detail.gateShut} />
        <Fragments fragments={detail.fragments} />
      </div>

      <div className="hall-prompt-bar">
        <Prompt offer={offer} onFire={fire} />
      </div>

      {atVault && (
        <Vault
          fragments={detail.fragments}
          drowned={detail.keypadDrowned}
          busy={busy}
          shake={detail.flash.includes('kachunk')}
          onSubmit={(code) => onAnswer(code)}
          onClose={() => setAtVault(false)}
        />
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
export function HallWorldFor({ room, live, actors, holding }: RoomProps) {
  const layout = useMemo(() => readLayout(room.data), [room.data])
  const detail = useMemo(() => readDetail(live), [live])

  const act = live?.act ?? 1
  const me = actors.find((actor) => actor.isMe)
  const offer = useOffer(act, detail, layout, me, holding)

  if (!layout) return null

  return (
    <HallWorld
      layout={layout}
      detail={detail}
      act={act}
      depth={live?.depth ?? 0}
      actors={actors}
      offer={offer}
    />
  )
}

/**
 * What the room is offering, worked out in both halves.
 *
 * Computed twice rather than threaded between them — it is a pure function of
 * state both halves already hold, and a shared context or a lifted prop would
 * be more machinery than the arithmetic it saves.
 */
function useOffer(
  act: number,
  detail: ReturnType<typeof readDetail>,
  layout: HallLayout | null,
  me: { userId: string; x: number; y: number } | undefined,
  holding: string | null,
): Interaction | null {
  return useMemo(() => {
    if (!layout || !me) return null
    return offeredAt(act, detail, layout, me, holding)
  }, [act, detail, layout, me, holding])
}
