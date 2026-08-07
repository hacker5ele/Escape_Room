import { within, type HallDetail, type HallLayout, type Spot } from './state'

/**
 * What the hall is offering you, here, now.
 *
 * One function, because "what does E do" has to have exactly one answer at any
 * moment or the prompt is lying. It takes the act, the live state and where you
 * are standing, and returns the single thing the room will do — or null, and
 * the prompt does not appear at all.
 *
 * The station a player is *nearest* wins when several are in range, which is
 * what lets the floor stay crowded: acts are sequential, so only one act's
 * stations are ever offered, and two acts' stations overlapping in space costs
 * nothing.
 */

export type Interaction =
  /** A one-off. E does it and it is done. */
  | { kind: 'press'; station: Spot; label: string }
  /** Take hold. E grabs, E again lets go. */
  | { kind: 'hold'; station: Spot; label: string }
  /** Let go of the thing already in your hands. */
  | { kind: 'release'; station: Spot; label: string }
  /** Hand the whole screen over. */
  | { kind: 'open'; station: Spot; label: string }

export function offeredAt(
  act: number,
  detail: HallDetail,
  layout: HallLayout,
  me: { userId: string; x: number; y: number },
  holding: string | null,
): Interaction | null {
  // Whatever else is nearby, the thing in your hands comes first. Being unable
  // to find the "let go" is a good way to be stuck at a winch for ever.
  if (holding) {
    const station = [...layout.wheels, ...layout.winches].find((one) => one.id === holding)
    if (station) return { kind: 'release', station, label: 'Let go' }
  }

  if (act === 1) {
    const lamp = nearest(layout.lamps, me, layout.radius)
    if (lamp) {
      const lit = (detail.lamps[lamp.id] ?? 0) > 0
      return { kind: 'press', station: lamp, label: lit ? 'Light it again' : 'Light the lamp' }
    }
  }

  if (act === 2) {
    if (detail.carrying[me.userId]) {
      const pedestal = nearest(layout.pedestals, me, layout.radius)
      if (pedestal) return { kind: 'press', station: pedestal, label: 'Set it down' }
    } else {
      const loose = layout.tablets.filter(
        (tablet) =>
          !detail.seated.includes(tablet.id) &&
          !Object.values(detail.carrying).includes(tablet.id),
      )
      const tablet = nearest(loose, me, layout.radius)
      if (tablet) return { kind: 'press', station: tablet, label: 'Take the tablet' }
    }
  }

  if (act === 4) {
    const winch = nearest(layout.winches, me, layout.radius)
    if (winch) return { kind: 'hold', station: winch, label: 'Wind the winch' }
  }

  if (act >= 5) {
    if (within(layout.keypad, me.x, me.y, layout.radius)) {
      return {
        kind: 'open',
        station: layout.keypad,
        label: detail.keypadDrowned ? 'The drums are under water' : 'Work the drums',
      }
    }
  }

  // The wheels are offered in every act, because the water never stops being
  // your problem. In act three they are the puzzle *as well* — taking hold of
  // one is what turns it, so one press does both jobs rather than the room
  // needing a second key for pumping.
  const wheel = nearest(layout.wheels, me, layout.radius)
  if (wheel) {
    return { kind: 'hold', station: wheel, label: act === 3 ? 'Turn the wheel' : 'Take the wheel' }
  }

  return null
}

function nearest(spots: Spot[], me: { x: number; y: number }, radius: number): Spot | null {
  let best: Spot | null = null
  let bestAway = Infinity
  for (const spot of spots) {
    const away = Math.hypot(me.x - spot.x, me.y - spot.y)
    if (away <= radius && away < bestAway) {
      best = spot
      bestAway = away
    }
  }
  return best
}
