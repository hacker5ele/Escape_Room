import { describe, expect, it } from 'vitest'
import {
  DROWN_DEPTH,
  FRAGMENTS,
  LAMP_MS,
  PAIR_WINDOW_MS,
  RATCHET_MS,
  REFORM_MS,
  START_DEPTH,
  beginHall,
  earnedFragments,
  publicHall,
  tickHall,
  tideTrend,
  wantedTurns,
  type Acted,
  type HallState,
  type Occupant,
} from './hall.js'
import { LAMPS, ORDER, PEDESTALS, TABLETS, stationById, type Station } from './layout.js'

/**
 * The hall, on a clock we hold.
 *
 * `tickHall` takes the time rather than reading it, which is the whole reason
 * these tests can run three minutes of drowning in a millisecond — and why none
 * of them touch `vi.setSystemTime`, which is global to the worker and lands its
 * failures on somebody else's file (ADR-0045 learned that one the hard way).
 */

const BEAT = 500
const NOBODY: Acted = { userId: '', stations: [] }

function at(userId: string, station: Station | undefined, facing: 1 | -1 = 1): Occupant {
  if (!station) throw new Error('no such station')
  return { userId, x: station.x, y: station.y, facing, walking: false, holding: null }
}

/** Standing at a station *and* having hold of it, which are now different things. */
function gripping(userId: string, station: Station | undefined, facing: 1 | -1 = 1): Occupant {
  return { ...at(userId, station, facing), holding: station?.id ?? null }
}

/** Somebody in the middle of the room, touching nothing. */
function adrift(userId: string): Occupant {
  return { userId, x: 800, y: 880, facing: 1, walking: false, holding: null }
}

/** One press of E, by one player, at one station. */
function presses(userId: string, ...stations: string[]): Acted {
  return { userId, stations }
}

/** Runs `ms` of beats and answers the clock it stopped at. */
function beats(state: HallState, from: number, ms: number, who: () => Occupant[]): number {
  let now = from
  const until = from + ms
  while (now < until) {
    now = Math.min(until, now + BEAT)
    tickHall(state, now, who(), NOBODY)
  }
  return now
}

describe('the tide', () => {
  /**
   * Two and a half minutes, pinned to the literal.
   *
   * Not derived from the constants, on purpose. The first version of this room
   * drowned you in forty-six seconds and its test still passed, because it was
   * written against whatever `RISE_PER_SECOND` happened to be. Pacing is the
   * thing players actually feel, so it is asserted as a duration and changing
   * it has to be a deliberate edit here.
   */
  it('takes about two and a half minutes to drown somebody doing nothing', () => {
    const patient = beginHall(0, 1)
    beats(patient, 0, 140_000, () => [adrift('a')])
    expect(patient.drowned).toBe(false)

    const drowned = beginHall(0, 1)
    beats(drowned, 0, 160_000, () => [adrift('a')])
    expect(drowned.drowned).toBe(true)
    expect(drowned.depth).toBe(DROWN_DEPTH)
  })

  /**
   * The change that E buys, stated as a test: a wheel turns because somebody
   * chose to take hold of it. Walking up to one and stopping — which used to
   * *be* the input — now does nothing at all.
   */
  it('does not pump for somebody merely standing at a wheel', () => {
    const state = beginHall(0, 1)
    beats(state, 0, 10_000, () => [at('a', stationById('wheel-west'))])

    expect(state.depth).toBeGreaterThan(START_DEPTH)
    expect(tideTrend(state, 10_000)).toBe('rising')
  })

  /**
   * The three states the gauge has to tell apart, and the reason `tideTrend`
   * reads the rate rather than counting wheels: one wheel creeps the level
   * back, two make real progress, and a gauge calling both the same thing would
   * be telling a player their partner was not helping.
   */
  it('creeps back with one wheel held, and falls properly with both', () => {
    const one = beginHall(0, 1)
    beats(one, 0, 10_000, () => [gripping('a', stationById('wheel-west'))])
    expect(one.depth).toBeLessThan(START_DEPTH)
    expect(tideTrend(one, 10_000)).toBe('holding')

    const two = beginHall(0, 2)
    beats(two, 0, 10_000, () => [
      gripping('a', stationById('wheel-west')),
      gripping('b', stationById('wheel-east')),
    ])
    expect(tideTrend(two, 10_000)).toBe('falling')

    // The second pair of hands has to be worth something markedly more than
    // twice as much, not a rounding difference.
    expect(START_DEPTH - two.depth).toBeGreaterThan((START_DEPTH - one.depth) * 3)
  })

  /**
   * Pinned to the literal five seconds rather than to `RATCHET_MS`. Written
   * against the constant first, which made it a tautology — the goalposts moved
   * with the value and a six-second ratchet passed happily.
   */
  it('keeps a wheel turning for five seconds after the last person lets go', () => {
    expect(RATCHET_MS).toBe(5_000)

    const state = beginHall(0, 1)
    tickHall(state, BEAT, [gripping('a', stationById('wheel-west'))], NOBODY)

    expect(tideTrend(state, BEAT + 4_900)).toBe('holding')
    expect(tideTrend(state, BEAT + 5_100)).toBe('rising')
  })

  /**
   * The design claim the solo path rests on, tested as behaviour rather than as
   * a constant: one player sprinting between the wheels gains ground. If this
   * ever goes positive the room is unwinnable alone, and no assertion about a
   * timeout would tell you.
   */
  it('lets one player sprinting between the wheels push the water back', () => {
    const state = beginHall(0, 1)
    const west = stationById('wheel-west')
    const east = stationById('wheel-east')

    let now = 0
    for (let leg = 0; leg < 6; leg += 1) {
      const wheel = leg % 2 === 0 ? west : east
      now += BEAT
      tickHall(state, now, [gripping('a', wheel)], NOBODY)
      now = beats(state, now, 3_300, () => [
        { userId: 'a', x: 800, y: 800, facing: 1, walking: true, holding: null },
      ])
    }

    expect(state.depth).toBeLessThan(START_DEPTH)
    expect(state.drowned).toBe(false)
  })

  /**
   * Drowning has to *stay* on the wire. Every client needs at least one beat
   * carrying it, or somebody gets teleported out of a room that looked fine.
   */
  it('stays drowned once it has drowned, whatever anybody does next', () => {
    const state = beginHall(0, 2)
    const now = beats(state, 0, 160_000, () => [adrift('a')])
    expect(state.drowned).toBe(true)

    beats(state, now, 10_000, () => [
      gripping('a', stationById('wheel-west')),
      gripping('b', stationById('wheel-east')),
    ])

    expect(state.drowned).toBe(true)
    expect(state.depth).toBe(DROWN_DEPTH)
  })
})

describe('what gets through to the mechanism', () => {
  it('ignores a press at a station the player is nowhere near', () => {
    const state = beginHall(0, 1)
    const lamp = LAMPS[0]

    // Standing in the middle of the room, claiming to have pressed E at a lamp
    // at the far end. The position is the thing that cannot be faked cheaply,
    // so it is the thing the claim is checked against.
    tickHall(state, BEAT, [adrift('a')], presses('a', lamp?.id ?? ''))

    const lamps = publicHall(state, BEAT).lamps as Record<string, number>
    expect(lamps[lamp?.id ?? '']).toBe(0)
  })

  it('ignores a wheel somebody claims to hold from across the hall', () => {
    const state = beginHall(0, 1)
    const liar: Occupant = { ...adrift('a'), holding: 'wheel-west' }

    beats(state, 0, 10_000, () => [liar])

    expect(state.depth).toBeGreaterThan(START_DEPTH)
  })
})

describe('act one, the lamps', () => {
  it('lights a lamp when E is pressed at it, and not before', () => {
    const state = beginHall(0, 1)
    const lamp = LAMPS[0]

    tickHall(state, BEAT, [at('a', lamp)], NOBODY)
    expect((publicHall(state, BEAT).lamps as Record<string, number>)[lamp?.id ?? '']).toBe(0)

    tickHall(state, 2 * BEAT, [at('a', lamp)], presses('a', lamp?.id ?? ''))
    expect(
      (publicHall(state, 2 * BEAT).lamps as Record<string, number>)[lamp?.id ?? ''],
    ).toBeGreaterThan(0)
  })

  it('finishes when all five are alight at once', () => {
    const state = beginHall(0, 1)
    let now = 0
    for (const lamp of LAMPS) {
      now += BEAT
      tickHall(state, now, [at('a', lamp)], presses('a', lamp.id))
    }

    expect(state.act).toBe(2)
    expect(earnedFragments(state)).toEqual([FRAGMENTS[0]])
  })

  it('lets a lamp go out, so the order they are lit in is the puzzle', () => {
    const state = beginHall(0, 1)
    const first = LAMPS[0]
    if (!first) throw new Error('no lamps')

    tickHall(state, BEAT, [at('a', first)], presses('a', first.id))
    const later = BEAT + LAMP_MS + BEAT
    tickHall(state, later, [adrift('a')], NOBODY)

    expect((publicHall(state, later).lamps as Record<string, number>)[first.id]).toBe(0)
    expect(state.act).toBe(1)
  })
})

describe('the hall counts you', () => {
  function pairOf(state: HallState): [string, string] {
    return publicHall(state, 0).pair as [string, string]
  }

  it('will not take a pair from one person doing both ends', () => {
    const state = beginHall(0, 2)
    const [west, east] = pairOf(state)

    tickHall(state, BEAT, [at('a', stationById(west)), adrift('b')], presses('a', west))
    tickHall(state, 2 * BEAT, [at('a', stationById(east)), adrift('b')], presses('a', east))

    expect(state.pairIndex).toBe(0)
  })

  it('takes it from two people within a moment of each other', () => {
    const state = beginHall(0, 2)
    const [west, east] = pairOf(state)
    const both = [at('a', stationById(west)), at('b', stationById(east))]

    tickHall(state, BEAT, both, presses('a', west))
    tickHall(state, 2 * BEAT, both, presses('b', east))

    expect(state.pairIndex).toBe(1)
  })

  it('will not take it when they are too far apart in time', () => {
    const state = beginHall(0, 2)
    const [west, east] = pairOf(state)
    const both = [at('a', stationById(west)), at('b', stationById(east))]

    tickHall(state, BEAT, both, presses('a', west))
    const late = BEAT + PAIR_WINDOW_MS + 1_000
    tickHall(state, late, both, presses('b', east))

    expect(state.pairIndex).toBe(0)
  })

  it('re-forms the act when a partner stops turning up', () => {
    const state = beginHall(0, 2)
    tickHall(state, BEAT, [adrift('a'), adrift('b')], NOBODY)
    expect(state.counted).toBe(2)

    beats(state, BEAT, REFORM_MS + 2 * BEAT, () => [adrift('a')])

    expect(state.counted).toBe(1)
  })

  it('does not re-form on a single missed beat', () => {
    const state = beginHall(0, 2)
    tickHall(state, BEAT, [adrift('a'), adrift('b')], NOBODY)
    tickHall(state, 2 * BEAT, [adrift('a')], NOBODY)

    expect(state.counted).toBe(2)
  })
})

describe('act two, the index', () => {
  function intoActTwo(): { state: HallState; now: number } {
    const state = beginHall(0, 1)
    let now = 0
    for (const lamp of LAMPS) {
      now += BEAT
      tickHall(state, now, [at('a', lamp)], presses('a', lamp.id))
    }
    return { state, now }
  }

  it('takes a tablet on E and seats it in the first pedestal', () => {
    const { state, now } = intoActTwo()
    const wanted = TABLETS.find((tablet) => tablet.id === ORDER[0])

    tickHall(state, now + BEAT, [at('a', wanted)], presses('a', wanted?.id ?? ''))
    expect(state.carrying['a']).toBe(ORDER[0])

    tickHall(state, now + 2 * BEAT, [at('a', PEDESTALS[0])], presses('a', PEDESTALS[0]?.id ?? ''))
    expect(state.seated).toEqual([ORDER[0]])
  })

  it('spits a tablet back out of the wrong pedestal, and the sea takes a step', () => {
    const { state, now } = intoActTwo()
    const wrong = TABLETS.find((tablet) => tablet.id === ORDER[1])

    tickHall(state, now + BEAT, [at('a', wrong)], presses('a', wrong?.id ?? ''))
    const before = state.depth

    tickHall(state, now + 2 * BEAT, [at('a', PEDESTALS[0])], presses('a', PEDESTALS[0]?.id ?? ''))

    expect(state.seated).toEqual([])
    expect(state.carrying['a']).toBeUndefined()
    expect(state.depth).toBeGreaterThan(before)
  })
})

describe('act three, the great wheel', () => {
  function intoActThree(counted: number): { state: HallState; now: number } {
    const state = beginHall(0, counted)
    state.act = 3
    return { state, now: 0 }
  }

  it('advances alone only on the right wheel turned the right way', () => {
    const { state } = intoActThree(1)
    const west = stationById('wheel-west')

    // The first step is the west wheel, turned to face right.
    tickHall(state, BEAT, [at('a', west, 1)], presses('a', 'wheel-west'))
    expect(state.step).toBe(1)
  })

  it('starts the sequence again on a wrong step, and the sea takes a step', () => {
    const { state } = intoActThree(1)
    const west = stationById('wheel-west')

    tickHall(state, BEAT, [at('a', west, 1)], presses('a', 'wheel-west'))
    const before = state.depth

    // Facing the wrong way is the wrong step, however right the wheel is.
    tickHall(state, 2 * BEAT, [at('a', west, -1)], presses('a', 'wheel-west'))

    expect(state.step).toBe(0)
    expect(state.depth).toBeGreaterThan(before)
  })

  it('needs both wheels turned the right way together when there are two of you', () => {
    const { state } = intoActThree(2)
    const want = wantedTurns(0)
    const both = [
      at('a', stationById('wheel-west'), want.west),
      at('b', stationById('wheel-east'), want.east),
    ]

    tickHall(state, BEAT, both, presses('a', 'wheel-west'))
    expect(state.step).toBe(0)

    tickHall(state, 2 * BEAT, both, presses('b', 'wheel-east'))
    expect(state.step).toBe(1)
  })

  /** Each plaque describes the *far* wheel. That is the puzzle, not a mistake. */
  it('shows each end the direction the other end needs', () => {
    const { state } = intoActThree(2)
    const shown = publicHall(state, 0)
    const want = wantedTurns(0)

    expect(shown.signWest).toBe(want.east)
    expect(shown.signEast).toBe(want.west)
    // And never the whole pattern, which is the solo view.
    expect(shown.sequence).toBeNull()
  })
})

describe('act four, the sluice gate', () => {
  function intoActFour(counted: number): HallState {
    const state = beginHall(0, counted)
    state.act = 4
    return state
  }

  it('is shut by one person holding one winch, slowly', () => {
    const state = intoActFour(1)
    beats(state, 0, 25_000, () => [gripping('a', stationById('winch-west'))])

    expect(state.gateShut).toBe(true)
    expect(state.act).toBe(5)
  })

  it('will not move for one winch when there are two of you', () => {
    const state = intoActFour(2)
    beats(state, 0, 25_000, () => [
      gripping('a', stationById('winch-west')),
      adrift('b'),
    ])

    expect(state.gateShut).toBe(false)
    expect(state.wound).toBe(0)
  })

  it('is shut much faster by two people holding both', () => {
    const state = intoActFour(2)
    beats(state, 0, 9_000, () => [
      gripping('a', stationById('winch-west')),
      gripping('b', stationById('winch-east')),
    ])

    expect(state.gateShut).toBe(true)
  })

  /** The only act that pays in mechanics rather than in figures. */
  it('halves the rise once it is shut, and awards no fragment', () => {
    const shut = intoActFour(1)
    shut.act = 5
    shut.gateShut = true
    const open = beginHall(0, 1)
    open.act = 5

    beats(shut, 0, 20_000, () => [adrift('a')])
    beats(open, 0, 20_000, () => [adrift('a')])

    const rose = shut.depth - START_DEPTH
    const roseOpen = open.depth - START_DEPTH
    expect(rose).toBeCloseTo(roseOpen / 2, 1)
    expect(earnedFragments(shut)).toHaveLength(3)
  })
})
