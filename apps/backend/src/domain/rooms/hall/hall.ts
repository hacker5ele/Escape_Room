import {
  CHANNEL,
  LAMPS,
  ORDER,
  PEDESTALS,
  STATION_RADIUS,
  TABLETS,
  WHEELS,
  isWorking,
  type Station,
} from './layout.js'

/**
 * The Reading Hall, sinking.
 *
 * The whole mechanism, as one state object and one `tick`. It is deliberately
 * pure — `tick` takes the time and who is standing where and returns the next
 * state — so the water can be tested by handing it a clock rather than by
 * waiting for one. `hall.service.ts` next door is the only thing that holds any
 * of it in memory.
 *
 * **Everything here is played by standing somewhere.** There is no clicking and
 * no typing anywhere in this room except the final code, which is why the whole
 * thing runs off positions that the heartbeat was already carrying twice a
 * second (ADR-0038). Adding a friend costs no new machinery at all: they are
 * simply another set of coordinates in the same list.
 */

// ---- the tide -------------------------------------------------------------

/** Depth runs 0 (dry) to 100 (over everybody's head). */
export const DROWN_DEPTH = 100

/** Not quite dry at the start: the sea is already in the room when you arrive. */
export const START_DEPTH = 12

/** Depth per second with nobody on a wheel. Fifty seconds from a standing start. */
export const RISE_PER_SECOND = 1.9

/**
 * And per second for each wheel somebody is standing at.
 *
 * Equal to the rise on purpose, which is what produces the three states the
 * room is built on: **nobody pumping and it rises, one wheel and it holds,
 * both wheels and it falls.** One wheel holding exactly level is the line the
 * whole difficulty curve balances on — alone you can stop the clock, but only
 * by standing still and therefore doing nothing else.
 */
export const PUMP_PER_SECOND = 1.9

/**
 * A wheel keeps turning for this long after the last person steps off it.
 *
 * This is the entire solo game. The hall is 1200 units between the wheels and
 * walking is 340 a second, so a crossing takes about 3.5s and leaves ~1.5s of
 * overlap at the far end — a lone player sprinting flat out drains perhaps a
 * third of what two people standing still manage. Enough to survive on, never
 * enough to be comfortable.
 */
export const RATCHET_MS = 5_000

/** The sea takes the next step when an act falls. */
export const SURGE_ACT = 12

/** And a lurch when somebody gets it wrong. Brute force is not survivable. */
export const SURGE_MISTAKE = 8

/** A lamp burns for this long once it catches. */
export const LAMP_MS = 12_000

/**
 * Above this the keypad is under water and will not take a code.
 *
 * Not picked: measured. The dial sits 210 units up a post standing at y 865, so
 * `floodLine` puts its face under at 41.3 — and a rule that fires at a
 * different number from the one you can see is a rule players will call a bug.
 */
export const KEYPAD_DEPTH = 41

/**
 * The hall re-counts if the party has changed for this long.
 *
 * Not instantly, because a dropped beat is not somebody leaving; and not never,
 * because a partner who closes their tab would otherwise leave you inside a
 * mechanism that has become impossible for one.
 */
export const REFORM_MS = 5_000

/**
 * The most time one tick may account for.
 *
 * A hidden tab beats every five seconds, so a tick legitimately covers that
 * much and the water has to rise for all of it — being in another tab is not a
 * pause. The cap only exists to stop a process that was stopped in a debugger
 * from drowning everybody the instant it resumes.
 */
const MAX_TICK_MS = 10_000

// ---- what an act needs ----------------------------------------------------

/** Act III wants four correct turns; act I wants four pairs, with two players. */
const ROUNDS = 4

/** Act III solo: how long a wheel must be held to wind the ratchet on one notch. */
const RATCHET_HOLD_S = 3

/**
 * Which pairs of lamps the hall asks for, with two people in it.
 *
 * Every pair is far apart, because a pair either side of the room is the whole
 * point — two players who can stand next to each other and light both are not
 * co-operating, they are queueing.
 */
const LAMP_PAIRS: readonly (readonly [string, string])[] = [
  ['lamp-0', 'lamp-4'],
  ['lamp-1', 'lamp-3'],
  ['lamp-0', 'lamp-3'],
  ['lamp-2', 'lamp-4'],
] as const

/**
 * The three fragments of the code, one per act.
 *
 * They are constants rather than secrets in themselves — what protects them is
 * that the server does not *send* one until the act that awards it is actually
 * finished. Reading the network tab tells a player exactly what playing the
 * room tells them, and no sooner, which is a stronger reading of ADR-0006 than
 * a room whose payload merely omits the final answer.
 */
export const FRAGMENTS: readonly string[] = ['62', '05', '39'] as const

/** What the three fragments spell. The only thing `check()` accepts. */
export const HALL_CODE = FRAGMENTS.join('')

// ---- state ----------------------------------------------------------------

export interface Occupant {
  userId: string
  x: number
  y: number
  facing: 1 | -1
  walking: boolean
}

export interface HallState {
  depth: number
  lastTick: number
  /** 1–3 are the acts that award fragments; 4 is the vault. */
  act: number
  /** The party size this act was formed for. Only ever 1 or 2 — the hall counts I or II. */
  counted: number
  /** When the live count first stopped matching. Null while they agree. */
  mismatchSince: number | null
  drowned: boolean
  /** Per wheel, when its ratchet runs out. */
  wheelUntil: Record<string, number>
  /** Per lamp, when its flame goes out. */
  lampOut: Record<string, number>
  /** Act I with two players: which pair the hall is asking for. */
  pairIndex: number
  /** Act II: tablets seated so far, in the order they went in. */
  seated: string[]
  /** Act II: who is carrying what. */
  carrying: Record<string, string>
  /** Act III: rounds turned correctly. */
  turns: number
  /** Act III with two players: which way each wheel has to be facing this round. */
  wantWest: 1 | -1
  wantEast: 1 | -1
  /** Act III alone: which wheel the ratchet wants next, and how long it has been held. */
  ratchetAt: string
  ratchetHeld: number
  /** Things that happened on this tick and want a noise and a splash. Cleared on read. */
  flash: string[]
}

export function beginHall(now: number, counted: number): HallState {
  return {
    depth: START_DEPTH,
    lastTick: now,
    act: 1,
    counted: countOf(counted),
    mismatchSince: null,
    drowned: false,
    wheelUntil: {},
    lampOut: {},
    pairIndex: 0,
    seated: [],
    carrying: {},
    turns: 0,
    wantWest: 1,
    wantEast: -1,
    ratchetAt: 'wheel-west',
    ratchetHeld: 0,
    flash: [],
  }
}

/** The hall counts I or II and nothing else — a third player is a second pair of hands. */
function countOf(partySize: number): number {
  return partySize >= 2 ? 2 : 1
}

// ---- the tick -------------------------------------------------------------

/**
 * One beat of the hall.
 *
 * Called from whichever heartbeat happens to arrive next rather than from a
 * timer, so a hall nobody is standing in costs nothing and there is no interval
 * keeping the process awake to flood an empty room. The same reasoning as
 * `LiveStore.#sweep`.
 */
export function tickHall(state: HallState, now: number, occupants: Occupant[]): HallState {
  // Drowning is terminal. The state stays exactly as it died until the party
  // leaves the room and a fresh one is begun, so every client gets at least one
  // beat carrying `drowned` and can play the splash before anybody moves.
  if (state.drowned) return state

  const seconds = Math.min(MAX_TICK_MS, Math.max(0, now - state.lastTick)) / 1000
  state.lastTick = now
  state.flash = []

  recount(state, now, occupants)

  // Wheels first: an act may finish this tick and surge, and the water it
  // surges into should already account for who was pumping.
  const held = pumpWheels(state, now, occupants)

  let surge = 0
  if (state.act === 1) surge += actOne(state, now, occupants)
  else if (state.act === 2) surge += actTwo(state, occupants)
  else if (state.act === 3) surge += actThree(state, seconds, occupants)

  const rate = RISE_PER_SECOND - PUMP_PER_SECOND * held
  state.depth = clamp(state.depth + rate * seconds + surge, 0, DROWN_DEPTH)

  if (state.depth >= DROWN_DEPTH) {
    state.drowned = true
    state.flash.push('glub')
  }

  return state
}

/**
 * The hall counts the people in it, and re-forms if that changes.
 *
 * Locked while an act runs, so a mechanism never changes shape under somebody's
 * hands — a friend arriving halfway through act two would otherwise open a
 * channel across the floor and drop whatever was being carried into it.
 */
function recount(state: HallState, now: number, occupants: Occupant[]): void {
  const live = countOf(occupants.length)
  if (live === state.counted) {
    state.mismatchSince = null
    return
  }

  if (state.mismatchSince === null) {
    state.mismatchSince = now
    return
  }

  if (now - state.mismatchSince < REFORM_MS) return

  // Re-form the current act for the new number. The act starts again rather
  // than being converted: the two faces of a mechanism are different puzzles,
  // and half of one is not a position the other can begin from.
  state.counted = live
  state.mismatchSince = null
  state.flash.push('recount')

  state.lampOut = {}
  state.pairIndex = 0
  state.seated = []
  state.carrying = {}
  state.turns = 0
  state.ratchetAt = 'wheel-west'
  state.ratchetHeld = 0
}

/** Refreshes each wheel's ratchet, and answers how many are turning right now. */
function pumpWheels(state: HallState, now: number, occupants: Occupant[]): number {
  let held = 0
  for (const wheel of WHEELS) {
    if (occupants.some((player) => isWorking(wheel, player))) {
      state.wheelUntil[wheel.id] = now + RATCHET_MS
    }
    if ((state.wheelUntil[wheel.id] ?? 0) > now) held += 1
  }
  return held
}

// ---- act I: light the hall ------------------------------------------------

function actOne(state: HallState, now: number, occupants: Occupant[]): number {
  if (state.counted >= 2) return actOnePaired(state, now, occupants)

  // Alone: standing at a lamp lights it, and it burns for twelve seconds. All
  // five have to be alight at the same moment, so this is a route problem —
  // which order leaves the first one you lit still going when you reach the
  // last.
  for (const lamp of LAMPS) {
    if (occupants.some((player) => isWorking(lamp, player))) {
      if ((state.lampOut[lamp.id] ?? 0) <= now) state.flash.push(`lit:${lamp.id}`)
      state.lampOut[lamp.id] = now + LAMP_MS
    }
  }

  if (LAMPS.every((lamp) => (state.lampOut[lamp.id] ?? 0) > now)) return finishAct(state)
  return 0
}

/**
 * With two in the hall the lamps will not take a flame singly.
 *
 * The archive was worked by a pair of scribes and it will not accept one person
 * doing both jobs, so the hall names two lamps at opposite ends and both have
 * to be stood at *by different people at the same moment*. Four pairs, and
 * neither of you can see what the other is standing next to.
 */
function actOnePaired(state: HallState, now: number, occupants: Occupant[]): number {
  const pair = LAMP_PAIRS[state.pairIndex]
  if (!pair) return finishAct(state)

  const [westId, eastId] = pair
  const west = LAMPS.find((lamp) => lamp.id === westId)
  const east = LAMPS.find((lamp) => lamp.id === eastId)
  if (!west || !east) return 0

  const onWest = occupants.filter((player) => isWorking(west, player))
  const onEast = occupants.filter((player) => isWorking(east, player))

  // Shown lit while somebody is there, so each of you can see your own half
  // working even though only the pair counts.
  if (onWest.length > 0) state.lampOut[westId] = now + 1_000
  if (onEast.length > 0) state.lampOut[eastId] = now + 1_000

  // Two *different* people. One player cannot be at both ends, but saying so
  // explicitly is what stops a stale position standing in for a second pair of
  // hands.
  const together = onWest.some((a) => onEast.some((b) => b.userId !== a.userId))
  if (!together) return 0

  state.pairIndex += 1
  state.flash.push('lit:pair')

  if (state.pairIndex >= LAMP_PAIRS.length) return finishAct(state)
  return 0
}

// ---- act II: the index ----------------------------------------------------

function actTwo(state: HallState, occupants: Occupant[]): number {
  let surge = 0

  for (const player of occupants) {
    const carried = state.carrying[player.userId]

    // Carrying a tablet into the channel loses it. The channel only exists with
    // two people in the hall, and it is what strands two of the five tablets on
    // the wrong side of the room.
    if (carried && state.counted >= 2 && inChannel(player.x)) {
      delete state.carrying[player.userId]
      state.flash.push('sploosh')
      continue
    }

    if (carried) {
      surge += seatIfAtPedestal(state, player, carried)
      continue
    }

    // Empty-handed: standing on a tablet picks it up. A tablet somebody else is
    // already carrying, or one already seated, is not on the floor to be found.
    const tablet = TABLETS.find(
      (candidate) =>
        isWorking(candidate, player) &&
        !state.seated.includes(candidate.id) &&
        !Object.values(state.carrying).includes(candidate.id),
    )
    if (tablet) {
      state.carrying[player.userId] = tablet.id
      state.flash.push(`took:${tablet.id}`)
    }
  }

  if (state.seated.length >= ORDER.length) return surge + finishAct(state)
  return surge
}

function seatIfAtPedestal(state: HallState, player: Occupant, carried: string): number {
  const next = state.seated.length
  const pedestal = PEDESTALS.find((candidate) => isWorking(candidate, player))
  if (!pedestal) return 0

  // Only the next pedestal in the row is open, and only for the tablet the tide
  // staff says belongs in it. Anything else is spat straight back out.
  if (pedestal.id === PEDESTALS[next]?.id && carried === ORDER[next]) {
    state.seated.push(carried)
    delete state.carrying[player.userId]
    state.flash.push(`seated:${carried}`)
    return 0
  }

  delete state.carrying[player.userId]
  state.flash.push('kachunk')
  return SURGE_MISTAKE
}

function inChannel(x: number): boolean {
  return x >= CHANNEL.minX && x <= CHANNEL.maxX
}

// ---- act III: the great wheel ---------------------------------------------

function actThree(state: HallState, seconds: number, occupants: Occupant[]): number {
  if (state.counted >= 2) return actThreePaired(state, occupants)

  // Alone: a ratchet. Hold one wheel until it winds on a notch, then the
  // counterweight has to be reset at the *other* wheel before it will take
  // another. Four notches, and the crossing between them is the cost.
  const wheel = WHEELS.find((candidate) => candidate.id === state.ratchetAt)
  if (!wheel) return 0

  if (!occupants.some((player) => isWorking(wheel, player))) {
    state.ratchetHeld = 0
    return 0
  }

  state.ratchetHeld += seconds
  if (state.ratchetHeld < RATCHET_HOLD_S) return 0

  state.ratchetHeld = 0
  state.turns += 1
  state.ratchetAt = state.ratchetAt === 'wheel-west' ? 'wheel-east' : 'wheel-west'
  state.flash.push('clang')

  if (state.turns >= ROUNDS) return finishAct(state)
  return 0
}

/**
 * With two, the wheels have to be turned the same way at the same time — and
 * **the plaque saying which way is at the other player's end.**
 *
 * Each of you can read what your partner has to do and not what you have to do,
 * so the only way through is to say it out loud. It is one carved sign at each
 * end of the room and it is the most co-operative thing in the game.
 *
 * Which way a wheel is being turned is which way the player is facing, and
 * `facing` has been on the heartbeat since the stage was built. Nothing new
 * travels for this at all.
 */
function actThreePaired(state: HallState, occupants: Occupant[]): number {
  const west = WHEELS.find((wheel) => wheel.id === 'wheel-west')
  const east = WHEELS.find((wheel) => wheel.id === 'wheel-east')
  if (!west || !east) return 0

  const onWest = occupants.filter(
    (player) => isWorking(west, player) && player.facing === state.wantWest,
  )
  const onEast = occupants.filter(
    (player) => isWorking(east, player) && player.facing === state.wantEast,
  )

  const together = onWest.some((a) => onEast.some((b) => b.userId !== a.userId))
  if (!together) return 0

  state.turns += 1
  state.flash.push('clang')

  if (state.turns >= ROUNDS) return finishAct(state)

  // A fresh pair of directions, derived from the round rather than drawn at
  // random — the same round always wants the same thing, so a hall that is
  // re-formed or replayed is the same puzzle rather than a new one.
  state.wantWest = state.turns % 2 === 0 ? 1 : -1
  state.wantEast = state.turns % 3 === 0 ? 1 : -1
  return 0
}

// ---- finishing ------------------------------------------------------------

/** An act falls, the sea takes the next step, and a fragment of the code appears. */
function finishAct(state: HallState): number {
  state.act += 1
  state.flash.push('act')
  return SURGE_ACT
}

/**
 * The fragments this hall has earned.
 *
 * One per act finished, and **never one more**. This is the whole of the room's
 * secret-keeping: `publicData()` carries positions and nothing else, so a
 * player reading the network tab learns the code at exactly the speed a player
 * doing the work learns it.
 */
export function earnedFragments(state: HallState): string[] {
  return FRAGMENTS.slice(0, Math.max(0, Math.min(FRAGMENTS.length, state.act - 1)))
}

/** Everything the room draws, and nothing it should not know yet. */
export function publicHall(state: HallState, now: number): Record<string, unknown> {
  const lamps: Record<string, boolean> = {}
  for (const lamp of LAMPS) lamps[lamp.id] = (state.lampOut[lamp.id] ?? 0) > now

  const wheels: Record<string, boolean> = {}
  for (const wheel of WHEELS) wheels[wheel.id] = (state.wheelUntil[wheel.id] ?? 0) > now

  const paired = state.counted >= 2

  return {
    lamps,
    wheels,
    pair: state.act === 1 && paired ? (LAMP_PAIRS[state.pairIndex] ?? null) : null,
    pairsDone: state.pairIndex,
    // The seating order only appears once the act that needs it begins — it is
    // painted on the tide staff, and the staff is under water until then.
    order: state.act === 2 ? [...ORDER] : null,
    seated: [...state.seated],
    carrying: { ...state.carrying },
    channel: state.act === 2 && paired,
    turns: state.turns,
    // Each sign describes the *far* wheel. That is the puzzle, not a mistake.
    signWest: state.act === 3 && paired ? state.wantEast : null,
    signEast: state.act === 3 && paired ? state.wantWest : null,
    ratchetAt: state.act === 3 && !paired ? state.ratchetAt : null,
    ratchetHeld: state.ratchetHeld,
    fragments: earnedFragments(state),
    keypadDrowned: state.depth > KEYPAD_DEPTH,
    radius: STATION_RADIUS,
    flash: [...state.flash],
  }
}

export function tideTrend(state: HallState, now: number): 'rising' | 'holding' | 'falling' {
  let held = 0
  for (const wheel of WHEELS) if ((state.wheelUntil[wheel.id] ?? 0) > now) held += 1
  if (held >= 2) return 'falling'
  if (held === 1) return 'holding'
  return 'rising'
}

/** A wrong code at the vault door, which the sea takes personally. */
export function penaliseHall(state: HallState): void {
  if (state.drowned) return
  state.depth = clamp(state.depth + SURGE_MISTAKE, 0, DROWN_DEPTH)
  state.flash.push('kachunk')
  if (state.depth >= DROWN_DEPTH) {
    state.drowned = true
    state.flash.push('glub')
  }
}

function clamp(value: number, low: number, high: number): number {
  if (!Number.isFinite(value)) return low
  return Math.min(high, Math.max(low, value))
}

/** Exposed for the room's layout payload and for the tests. */
export const HALL_STATIONS: readonly Station[] = [...WHEELS, ...LAMPS, ...PEDESTALS, ...TABLETS]
