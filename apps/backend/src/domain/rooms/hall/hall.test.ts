import { describe, expect, it } from 'vitest'
import {
  DROWN_DEPTH,
  FRAGMENTS,
  LAMP_MS,
  RATCHET_MS,
  REFORM_MS,
  START_DEPTH,
  beginHall,
  earnedFragments,
  publicHall,
  tickHall,
  tideTrend,
  type HallState,
  type Occupant,
} from './hall.js'
import { LAMPS, ORDER, PEDESTALS, TABLETS, stationById, type Station } from './layout.js'

/**
 * The hall, on a clock we hold.
 *
 * `tickHall` takes the time rather than reading it, which is the whole reason
 * these tests can run a minute of drowning in a millisecond — and why none of
 * them touch `vi.setSystemTime`, which is global to the worker and lands its
 * failures on somebody else's file (ADR-0045 learned that one the hard way).
 */

const BEAT = 500

function standing(userId: string, at: Station | undefined, facing: 1 | -1 = 1): Occupant {
  if (!at) throw new Error('no such station')
  return { userId, x: at.x, y: at.y, facing, walking: false }
}

/** Somebody in the middle of the room, touching nothing. */
function adrift(userId: string): Occupant {
  return { userId, x: 800, y: 880, facing: 1, walking: false }
}

/** Runs `ms` of beats and answers the clock it stopped at. */
function beats(state: HallState, from: number, ms: number, who: () => Occupant[]): number {
  let now = from
  const until = from + ms
  while (now < until) {
    now = Math.min(until, now + BEAT)
    tickHall(state, now, who())
  }
  return now
}

describe('the tide', () => {
  it('drowns a party that stands about doing nothing', () => {
    const state = beginHall(0, 1)
    beats(state, 0, 60_000, () => [adrift('a')])

    expect(state.drowned).toBe(true)
    expect(state.depth).toBe(DROWN_DEPTH)
  })

  /**
   * Drowning is terminal, and it has to *stay* on the wire.
   *
   * Every client has to see at least one beat carrying it, or somebody gets
   * teleported out of a room that looked fine to them. A hall that quietly
   * un-drowned itself on the next tick — because the wheels were still turning,
   * say — would do exactly that to a guest whose beat landed a moment late.
   */
  it('stays drowned once it has drowned, whatever anybody does next', () => {
    const state = beginHall(0, 2)
    const now = beats(state, 0, 60_000, () => [adrift('a')])
    expect(state.drowned).toBe(true)

    beats(state, now, 10_000, () => [
      standing('a', stationById('wheel-west')),
      standing('b', stationById('wheel-east')),
    ])

    expect(state.drowned).toBe(true)
    expect(state.depth).toBe(DROWN_DEPTH)
  })

  it('rises when nobody is on a wheel', () => {
    const state = beginHall(0, 1)
    beats(state, 0, 5_000, () => [adrift('a')])

    expect(state.depth).toBeGreaterThan(START_DEPTH)
    expect(tideTrend(state, 5_000)).toBe('rising')
  })

  /**
   * The line the whole difficulty curve balances on. One wheel exactly cancels
   * the rise, so a lone player can stop the clock — but only by standing still,
   * which is also the only way to get nothing else done.
   */
  it('holds level with one wheel held, and falls with both', () => {
    const held = beginHall(0, 1)
    beats(held, 0, 6_000, () => [standing('a', stationById('wheel-west'))])
    expect(held.depth).toBeCloseTo(START_DEPTH, 5)
    expect(tideTrend(held, 6_000)).toBe('holding')

    const falling = beginHall(0, 2)
    beats(falling, 0, 6_000, () => [
      standing('a', stationById('wheel-west')),
      standing('b', stationById('wheel-east')),
    ])
    expect(falling.depth).toBeLessThan(START_DEPTH)
    expect(tideTrend(falling, 6_000)).toBe('falling')
  })

  /**
   * Pinned to the literal five seconds rather than to `RATCHET_MS`.
   *
   * Written against the constant first, which made it a tautology — the
   * goalposts moved with the value and a six-second ratchet passed happily.
   * This is a tuned game number, not an implementation detail: the crossing
   * between the wheels takes about 3.5s, so the margin here *is* the solo
   * player's whole living.
   */
  it('keeps a wheel turning for five seconds after the last person leaves it', () => {
    expect(RATCHET_MS).toBe(5_000)

    const state = beginHall(0, 1)
    tickHall(state, BEAT, [standing('a', stationById('wheel-west'))])

    expect(tideTrend(state, BEAT + 4_900)).toBe('holding')
    expect(tideTrend(state, BEAT + 5_100)).toBe('rising')
  })

  /**
   * The design claim the whole solo path rests on, tested as a behaviour rather
   * than as a constant: **one player sprinting flat out between the two wheels
   * gains ground.** If this ever goes positive the room is unwinnable alone, and
   * no assertion about a timeout would tell you.
   */
  it('lets one player sprinting between the wheels push the water back', () => {
    const state = beginHall(0, 1)
    const west = stationById('wheel-west')
    const east = stationById('wheel-east')
    if (!west || !east) throw new Error('no wheels')

    // Four seconds a leg: half a second stood at the wheel, three and a half
    // walking to the far one. That is the real crossing at 340 units a second.
    let now = 0
    for (let leg = 0; leg < 6; leg += 1) {
      const wheel = leg % 2 === 0 ? west : east
      now += BEAT
      tickHall(state, now, [standing('a', wheel)])
      now = beats(state, now, 3_500, () => [
        { userId: 'a', x: 800, y: 800, facing: 1, walking: true },
      ])
    }

    expect(state.depth).toBeLessThan(START_DEPTH)
    expect(state.drowned).toBe(false)
  })

  /** And the other half of the same trade: sprinting is all you can do while you do it. */
  it('loses ground when that same player stops to work on something', () => {
    const state = beginHall(0, 1)
    beats(state, 0, 24_000, () => [adrift('a')])

    expect(state.depth).toBeGreaterThan(START_DEPTH)
  })

  it('does not engage a station somebody is merely walking through', () => {
    const state = beginHall(0, 1)
    const wheel = stationById('wheel-west')
    if (!wheel) throw new Error('no wheel')

    beats(state, 0, 4_000, () => [
      { userId: 'a', x: wheel.x, y: wheel.y, facing: 1, walking: true },
    ])

    // Walking past a wheel pumps nothing, so the water did what it does when
    // nobody is helping.
    expect(state.depth).toBeGreaterThan(START_DEPTH)
    expect(tideTrend(state, 4_000)).toBe('rising')
  })
})

describe('the code', () => {
  it('gives out no fragment before an act has been finished', () => {
    const state = beginHall(0, 1)
    tickHall(state, BEAT, [adrift('a')])

    expect(earnedFragments(state)).toEqual([])
    expect(JSON.stringify(publicHall(state, BEAT))).not.toContain(FRAGMENTS[0])
  })

  it('gives out exactly one fragment once the lamps are lit', () => {
    const state = beginHall(0, 1)

    // Alone, standing at each lamp in turn lights it; all five have to be
    // burning at the same moment, and they burn for twelve seconds.
    let now = 0
    for (const lamp of LAMPS) {
      now += BEAT
      tickHall(state, now, [standing('a', lamp)])
    }

    expect(state.act).toBe(2)
    expect(earnedFragments(state)).toEqual([FRAGMENTS[0]])
    expect(earnedFragments(state)).not.toContain(FRAGMENTS[1])
  })

  it('lets a lamp go out, so the order they are lit in is the puzzle', () => {
    const state = beginHall(0, 1)
    const first = LAMPS[0]
    if (!first) throw new Error('no lamps')

    tickHall(state, BEAT, [standing('a', first)])
    const afterwards = BEAT + LAMP_MS + BEAT
    tickHall(state, afterwards, [adrift('a')])

    const lamps = publicHall(state, afterwards).lamps as Record<string, boolean>
    expect(lamps[first.id]).toBe(false)
    expect(state.act).toBe(1)
  })
})

describe('the hall counts you', () => {
  it('will not light a pair for one person standing at one end', () => {
    const state = beginHall(0, 2)
    const pair = publicHall(state, 0).pair as [string, string]
    const west = LAMPS.find((lamp) => lamp.id === pair[0])

    beats(state, 0, 4_000, () => [standing('a', west), adrift('b')])

    expect(state.pairIndex).toBe(0)
    expect(state.act).toBe(1)
  })

  it('lights it for two people at both ends at once', () => {
    const state = beginHall(0, 2)
    const pair = publicHall(state, 0).pair as [string, string]
    const west = LAMPS.find((lamp) => lamp.id === pair[0])
    const east = LAMPS.find((lamp) => lamp.id === pair[1])

    tickHall(state, BEAT, [standing('a', west), standing('b', east)])

    expect(state.pairIndex).toBe(1)
  })

  /**
   * A partner who closes their tab would otherwise leave you standing inside a
   * mechanism that has become impossible for one.
   */
  it('re-forms the act when a partner stops turning up', () => {
    const state = beginHall(0, 2)
    tickHall(state, BEAT, [adrift('a'), adrift('b')])
    expect(state.counted).toBe(2)

    beats(state, BEAT, REFORM_MS + 2 * BEAT, () => [adrift('a')])

    expect(state.counted).toBe(1)
  })

  it('does not re-form on a single missed beat', () => {
    const state = beginHall(0, 2)
    tickHall(state, BEAT, [adrift('a'), adrift('b')])
    tickHall(state, 2 * BEAT, [adrift('a')])

    expect(state.counted).toBe(2)
  })
})

describe('the index', () => {
  /** Walks a solo player through act one so act two is the live one. */
  function intoActTwo(): { state: HallState; now: number } {
    const state = beginHall(0, 1)
    let now = 0
    for (const lamp of LAMPS) {
      now += BEAT
      tickHall(state, now, [standing('a', lamp)])
    }
    return { state, now }
  }

  it('picks a tablet up by standing on it and seats it in the first pedestal', () => {
    const { state, now } = intoActTwo()
    expect(state.act).toBe(2)

    const wanted = TABLETS.find((tablet) => tablet.id === ORDER[0])
    tickHall(state, now + BEAT, [standing('a', wanted)])
    expect(state.carrying['a']).toBe(ORDER[0])

    tickHall(state, now + 2 * BEAT, [standing('a', PEDESTALS[0])])
    expect(state.seated).toEqual([ORDER[0]])
    expect(state.carrying['a']).toBeUndefined()
  })

  it('spits a tablet back out of the wrong pedestal, and the sea takes a step', () => {
    const { state, now } = intoActTwo()

    const wrong = TABLETS.find((tablet) => tablet.id === ORDER[1])
    tickHall(state, now + BEAT, [standing('a', wrong)])
    const before = state.depth

    tickHall(state, now + 2 * BEAT, [standing('a', PEDESTALS[0])])

    expect(state.seated).toEqual([])
    expect(state.carrying['a']).toBeUndefined()
    expect(state.depth).toBeGreaterThan(before)
  })
})
