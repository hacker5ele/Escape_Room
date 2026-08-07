import {
  CHANNEL,
  LAMPS,
  ORDER,
  PEDESTALS,
  STATION_RADIUS,
  TABLETS,
  WHEELS,
  WINCHES,
  isNear,
  type Station,
} from './layout.js'

/**
 * The Reading Hall, sinking.
 *
 * The whole mechanism, as one state object and one `tick`. It is deliberately
 * pure — `tick` takes the time, who is standing where, and what they just did,
 * and returns the next state — so the water can be tested by handing it a clock
 * rather than by waiting for one. `hall.service.ts` is the only thing that
 * holds any of it in memory.
 *
 * **Everything is done by pressing E at something.** An earlier version had
 * standing on a station *be* the action, which was elegant and completely mute:
 * you walked into a lamp and it lit with no warning, and you could walk past
 * the vault without ever learning it was the vault. A room with four
 * mechanisms in it has to be able to say what they are.
 *
 * Two kinds of input come off the heartbeat as a result. `acted` is an event —
 * the stations somebody pressed E at since the last beat, consumed by the beat
 * that carries them. `holding` is state — the winch or wheel somebody currently
 * has hold of, re-sent every beat, which is what lets everybody else in the
 * room watch it turn.
 *
 * **The hall counts you**, and changes shape on the answer. What one person can
 * work alone, two people have to work together.
 */

// ---- the tide -------------------------------------------------------------

/** Depth runs 0 (dry) to 100 (over everybody's head). */
export const DROWN_DEPTH = 100

/** Not quite dry at the start: the sea is already in the room when you arrive. */
export const START_DEPTH = 10

/**
 * Depth per second with nobody on a wheel.
 *
 * **Two and a half minutes** from a standing start to drowned. The first
 * version of this room ran at 1.9 and killed you in forty-six seconds, which is
 * not enough time to read a caption, let alone think about a puzzle — the water
 * stopped being a clock and became a hurry.
 */
export const RISE_PER_SECOND = 0.6

/**
 * And per second for each wheel being turned.
 *
 * Deliberately *larger* than the rise, which gives the room three states rather
 * than two: nobody pumping and it climbs, **one wheel and it creeps back**,
 * both wheels and it falls properly. An earlier version had pump exactly cancel
 * rise, which was a tidier rule and a worse game — one player could only ever
 * tread water, and clearing the last thirty points before the vault took a
 * minute and a half of two people standing still.
 */
export const PUMP_PER_SECOND = 0.85

/**
 * What shutting the sluice gate is worth: the sea comes in at half the rate for
 * the rest of the run.
 *
 * Act IV is the only act that pays in *mechanics* rather than in figures, and
 * this is the payment. It is also the only reason to spend twenty seconds
 * holding a winch while the water climbs unchecked, which is exactly the
 * decision the act is made of.
 */
export const SHUT_GATE_RELIEF = 0.5

/**
 * A wheel keeps turning for this long after the last person lets go of it.
 *
 * This is the entire solo game. The hall is 1130 units between the wheels and
 * walking is 340 a second, so a crossing takes about 3.3s and leaves a moment
 * of overlap at the far end — a lone player sprinting flat out gains ground,
 * slowly. Enough to survive on, never enough to be comfortable.
 */
export const RATCHET_MS = 5_000

/** The sea takes the next step when an act falls. */
export const SURGE_ACT = 8

/** And a lurch when somebody gets it wrong. Brute force is not survivable. */
export const SURGE_MISTAKE = 6

/**
 * A lamp burns for this long once it catches.
 *
 * Longer than it was, because lighting one is now a keypress rather than a side
 * effect of walking into it — the route still has to be planned, but it no
 * longer has to be run at a sprint with no margin.
 */
export const LAMP_MS = 16_000

/** Above this the vault's drums are under water and will not take a code. */
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
 * How far apart two presses may be and still count as together.
 *
 * A keypress cannot be simultaneous the way standing in a place can, so
 * "at the same time" has to become "within a moment of each other". Two seconds
 * is long enough to count down out loud and short enough that one person cannot
 * sprint between the two ends and do both.
 */
export const PAIR_WINDOW_MS = 2_000

/** How long one person must hold the winch alone to shut the gate. */
export const WIND_ALONE_MS = 22_000

/** And how long two people holding both winches take. */
export const WIND_TOGETHER_MS = 7_000

/** Wound progress bleeds away when nobody is holding on. */
const UNWIND_PER_SECOND = 0.6

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

/** Act I wants four pairs with two players; act III wants four turns. */
const ROUNDS = 4

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

export interface Step {
  wheel: string
  /** Which way it has to be turned, which is which way the player is facing. */
  dir: 1 | -1
}

/**
 * Act III alone: the pattern stamped on the gearbox.
 *
 * Fixed rather than drawn at random, so a hall that is replayed or re-formed is
 * the same puzzle rather than a new one — and so a player who dies to the water
 * halfway through has learned something worth keeping.
 */
const SEQUENCE: readonly Step[] = [
  { wheel: 'wheel-west', dir: 1 },
  { wheel: 'wheel-east', dir: -1 },
  { wheel: 'wheel-east', dir: 1 },
  { wheel: 'wheel-west', dir: -1 },
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

/** What the three fragments spell. The only thing `check()` ever accepts. */
export const HALL_CODE = FRAGMENTS.join('')

/** Acts I to III award a fragment each; IV shuts the gate; V is the vault. */
export const FRAGMENT_ACTS = 3

// ---- state ----------------------------------------------------------------

export interface Occupant {
  userId: string
  x: number
  y: number
  facing: 1 | -1
  walking: boolean
  /** The station they currently have hold of. Verified against position already. */
  holding: string | null
}

/** What one player pressed E at, on the beat being processed. */
export interface Acted {
  userId: string
  stations: readonly string[]
}

export interface HallState {
  depth: number
  lastTick: number
  /** 1–3 award fragments, 4 shuts the gate, 5 is the vault. */
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
  /** Act I with two players: which pair, and who lit which half when. */
  pairIndex: number
  pairLitAt: Record<string, number>
  pairLitBy: Record<string, string>
  /** Act II: tablets seated so far, and who is carrying what. */
  seated: string[]
  carrying: Record<string, string>
  /** Act III: how far into the sequence, or how many rounds turned together. */
  step: number
  turned: Record<string, number>
  turnedBy: Record<string, string>
  /** Act IV: how far the gate is wound shut, 0 to 1, and whether it stayed. */
  wound: number
  gateShut: boolean
  /** Things that happened on this tick and want a noise. Cleared on read. */
  flash: string[]
  /** What each player should be shown saying, this tick. Cleared on read. */
  says: Record<string, string>
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
    pairLitAt: {},
    pairLitBy: {},
    seated: [],
    carrying: {},
    step: 0,
    turned: {},
    turnedBy: {},
    wound: 0,
    gateShut: false,
    flash: [],
    says: {},
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
export function tickHall(
  state: HallState,
  now: number,
  occupants: Occupant[],
  acted: Acted = { userId: '', stations: [] },
): HallState {
  // Drowning is terminal. The state stays exactly as it died until the party
  // leaves the room and a fresh one is begun, so every client gets at least one
  // beat carrying `drowned` and can play the splash before anybody moves.
  if (state.drowned) return state

  const seconds = Math.min(MAX_TICK_MS, Math.max(0, now - state.lastTick)) / 1000
  state.lastTick = now
  state.flash = []
  state.says = {}

  recount(state, now, occupants)

  // Wheels first: an act may finish this tick and surge, and the water it
  // surges into should already account for who was pumping.
  const held = pumpWheels(state, now, occupants)

  let surge = 0
  if (state.act === 1) surge += actOne(state, now, occupants, acted)
  else if (state.act === 2) surge += actTwo(state, occupants, acted)
  else if (state.act === 3) surge += actThree(state, now, occupants, acted)
  else if (state.act === 4) surge += actFour(state, seconds, occupants)

  const rising = RISE_PER_SECOND * (state.gateShut ? SHUT_GATE_RELIEF : 1)
  const rate = rising - PUMP_PER_SECOND * held
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
  state.pairLitAt = {}
  state.pairLitBy = {}
  state.seated = []
  state.carrying = {}
  state.step = 0
  state.turned = {}
  state.turnedBy = {}
  state.wound = 0
}

/**
 * Refreshes each wheel's ratchet, and answers how many are turning right now.
 *
 * A wheel turns because somebody has **hold** of it — not because somebody is
 * standing near it. Which means walking past a wheel on the way somewhere no
 * longer silently starts pumping, and a player who wants the water held has to
 * choose to stay there.
 */
function pumpWheels(state: HallState, now: number, occupants: Occupant[]): number {
  let held = 0
  for (const wheel of WHEELS) {
    if (occupants.some((player) => hasHoldOf(player, wheel))) {
      state.wheelUntil[wheel.id] = now + RATCHET_MS
    }
    if ((state.wheelUntil[wheel.id] ?? 0) > now) held += 1
  }
  return held
}

/**
 * Somebody has hold of a station if they say so **and** they are standing close
 * enough for that to be true.
 *
 * Checked here rather than only in the service that assembles the occupants,
 * because this file is where the mechanism actually lives and it should not
 * depend on having been handed clean input. A test caught it the other way
 * round: with the check only in the service, a hand-made occupant claiming a
 * wheel at the far end of the hall pumped it happily.
 */
function hasHoldOf(player: Occupant, station: Station): boolean {
  return player.holding === station.id && isNear(station, player)
}

/** Everything this player pressed E at, that they were actually near. */
function pressesOn(
  acted: Acted,
  occupants: Occupant[],
  stations: readonly Station[],
): { player: Occupant; station: Station }[] {
  const player = occupants.find((one) => one.userId === acted.userId)
  if (!player) return []

  const out: { player: Occupant; station: Station }[] = []
  for (const id of acted.stations) {
    const station = stations.find((one) => one.id === id)
    // Verified rather than trusted. A station named from the other end of the
    // hall is not one this player could have pressed E at.
    if (station && isNear(station, player)) out.push({ player, station })
  }
  return out
}

// ---- act I: light the hall ------------------------------------------------

function actOne(state: HallState, now: number, occupants: Occupant[], acted: Acted): number {
  const presses = pressesOn(acted, occupants, LAMPS)

  if (state.counted >= 2) return actOnePaired(state, now, presses)

  // Alone: pressing E at a lamp lights it, and it burns for sixteen seconds.
  // All five have to be alight at the same moment, so this is a route problem —
  // which order leaves the first one you lit still going when you reach the
  // last.
  for (const { station } of presses) {
    state.lampOut[station.id] = now + LAMP_MS
    state.flash.push(`lit:${station.id}`)
    state.says[acted.userId] = 'LIT!'
  }

  if (LAMPS.every((lamp) => (state.lampOut[lamp.id] ?? 0) > now)) return finishAct(state)
  return 0
}

/**
 * With two in the hall the lamps will not take a flame singly.
 *
 * The archive was worked by a pair of scribes and will not accept one person
 * doing both jobs, so the hall names two lamps at opposite ends and both have
 * to be lit **within a moment of each other, by different people**.
 *
 * A window rather than an instant, because a keypress cannot be simultaneous
 * the way standing somewhere can. Two seconds is long enough to count down out
 * loud and short enough that nobody can sprint between the ends and do both.
 */
function actOnePaired(
  state: HallState,
  now: number,
  presses: { player: Occupant; station: Station }[],
): number {
  const pair = LAMP_PAIRS[state.pairIndex]
  if (!pair) return finishAct(state)

  for (const { player, station } of presses) {
    if (!pair.includes(station.id)) {
      // The wrong lamp entirely. Lit, briefly, so it is obvious what happened.
      state.lampOut[station.id] = now + 1_200
      state.says[player.userId] = 'NOT THAT ONE'
      continue
    }
    state.pairLitAt[station.id] = now
    state.pairLitBy[station.id] = player.userId
    state.lampOut[station.id] = now + PAIR_WINDOW_MS
    state.flash.push(`lit:${station.id}`)
    state.says[player.userId] = 'NOW!'
  }

  const [west, east] = pair
  const westAt = state.pairLitAt[west] ?? 0
  const eastAt = state.pairLitAt[east] ?? 0
  const together =
    westAt > 0 &&
    eastAt > 0 &&
    Math.abs(westAt - eastAt) <= PAIR_WINDOW_MS &&
    state.pairLitBy[west] !== state.pairLitBy[east]

  if (!together) return 0

  state.pairIndex += 1
  state.pairLitAt = {}
  state.pairLitBy = {}
  state.flash.push('lit:pair')

  if (state.pairIndex >= LAMP_PAIRS.length) return finishAct(state)
  return 0
}

// ---- act II: the index ----------------------------------------------------

function actTwo(state: HallState, occupants: Occupant[], acted: Acted): number {
  let surge = 0

  // Carrying a tablet into the channel loses it, and that is still a rule about
  // *walking* rather than about pressing anything — the channel only exists
  // with two people in the hall, and it is what strands two of the five tablets
  // on the wrong side of the room.
  for (const player of occupants) {
    const carried = state.carrying[player.userId]
    if (carried && state.counted >= 2 && inChannel(player.x)) {
      delete state.carrying[player.userId]
      state.flash.push('sploosh')
      state.says[player.userId] = 'NO!'
    }
  }

  for (const { player, station } of pressesOn(acted, occupants, TABLETS)) {
    if (state.carrying[player.userId]) continue
    if (state.seated.includes(station.id)) continue
    if (Object.values(state.carrying).includes(station.id)) continue

    state.carrying[player.userId] = station.id
    state.flash.push(`took:${station.id}`)
    state.says[player.userId] = 'GOT IT'
  }

  for (const { player, station } of pressesOn(acted, occupants, PEDESTALS)) {
    const carried = state.carrying[player.userId]
    if (!carried) continue
    surge += seat(state, player, station, carried)
  }

  if (state.seated.length >= ORDER.length) return surge + finishAct(state)
  return surge
}

function seat(state: HallState, player: Occupant, pedestal: Station, carried: string): number {
  const next = state.seated.length

  // Only the next pedestal in the row is open, and only for the tablet the tide
  // staff says belongs in it. Anything else is spat straight back out.
  if (pedestal.id === PEDESTALS[next]?.id && carried === ORDER[next]) {
    state.seated.push(carried)
    delete state.carrying[player.userId]
    state.flash.push(`seated:${carried}`)
    state.says[player.userId] = 'THAT ONE'
    return 0
  }

  delete state.carrying[player.userId]
  state.flash.push('kachunk')
  state.says[player.userId] = 'WRONG!'
  return SURGE_MISTAKE
}

function inChannel(x: number): boolean {
  return x >= CHANNEL.minX && x <= CHANNEL.maxX
}

// ---- act III: the great wheel ---------------------------------------------

function actThree(state: HallState, now: number, occupants: Occupant[], acted: Acted): number {
  const presses = pressesOn(acted, occupants, WHEELS)
  if (state.counted >= 2) return actThreePaired(state, now, presses)

  // Alone: a pattern stamped on the gearbox — which wheel, and which way. Turn
  // them in that order. One wrong step and it starts again, which is what makes
  // it a thing to remember rather than a thing to grind.
  let surge = 0
  for (const { player, station } of presses) {
    const want = SEQUENCE[state.step]
    if (!want) break

    if (station.id === want.wheel && player.facing === want.dir) {
      state.step += 1
      state.flash.push('clang')
      state.says[player.userId] = `${state.step} OF ${SEQUENCE.length}`
      if (state.step >= SEQUENCE.length) return surge + finishAct(state)
      continue
    }

    state.step = 0
    state.flash.push('kachunk')
    state.says[player.userId] = 'IT SLIPS BACK'
    surge += SURGE_MISTAKE
  }

  return surge
}

/**
 * With two, both wheels have to be turned the same way within a moment of each
 * other — and **the plaque saying which way is at the other player's end.**
 *
 * Each of you can read what your partner has to do and not what you have to do,
 * so the only way through is to say it out loud. It is one carved sign at each
 * end of the room and it is the most co-operative thing in the game.
 *
 * Which way a wheel is turned is which way the player is facing, and `facing`
 * has been on the heartbeat since the stage was built. Nothing new travels for
 * this at all.
 */
function actThreePaired(
  state: HallState,
  now: number,
  presses: { player: Occupant; station: Station }[],
): number {
  const want = wantedTurns(state.step)

  for (const { player, station } of presses) {
    const dir = station.id === 'wheel-west' ? want.west : want.east
    if (player.facing !== dir) {
      state.flash.push('kachunk')
      state.says[player.userId] = 'WRONG WAY'
      continue
    }
    state.turned[station.id] = now
    state.turnedBy[station.id] = player.userId
    state.flash.push('clang')
    state.says[player.userId] = 'TURNING!'
  }

  const westAt = state.turned['wheel-west'] ?? 0
  const eastAt = state.turned['wheel-east'] ?? 0
  const together =
    westAt > 0 &&
    eastAt > 0 &&
    Math.abs(westAt - eastAt) <= PAIR_WINDOW_MS &&
    state.turnedBy['wheel-west'] !== state.turnedBy['wheel-east']

  if (!together) return 0

  state.step += 1
  state.turned = {}
  state.turnedBy = {}

  if (state.step >= ROUNDS) return finishAct(state)
  return 0
}

/**
 * Which way each wheel wants turning this round.
 *
 * Derived from the round rather than drawn at random, so the same round always
 * wants the same thing — a hall that is re-formed or replayed is the same
 * puzzle rather than a new one.
 */
export function wantedTurns(step: number): { west: 1 | -1; east: 1 | -1 } {
  return {
    west: step % 2 === 0 ? 1 : -1,
    east: step % 3 === 0 ? -1 : 1,
  }
}

// ---- act IV: the sluice gate ----------------------------------------------

/**
 * Shut the gate the sea is coming in through.
 *
 * The only act that pays in mechanics rather than in figures: the water comes
 * in at **half the rate** for the rest of the run. It is also the only act with
 * no puzzle in it at all, deliberately — it is a decision. Winding costs
 * twenty-odd seconds during which nobody is on the pump wheels and the water
 * climbs unchecked, and the question is whether you can afford it.
 *
 * Alone it is a long hold on one winch. Together, **both winches at once** and
 * it takes seven seconds — and it only moves while both are held, so a pair
 * genuinely has to commit to it at the same moment.
 */
function actFour(state: HallState, seconds: number, occupants: Occupant[]): number {
  const held = WINCHES.filter((winch) =>
    occupants.some((player) => hasHoldOf(player, winch)),
  ).length
  const paired = state.counted >= 2

  const winding = paired ? held >= WINCHES.length : held >= 1
  if (winding) {
    state.wound += seconds / ((paired ? WIND_TOGETHER_MS : WIND_ALONE_MS) / 1000)
  } else {
    state.wound -= (UNWIND_PER_SECOND * seconds) / 10
  }
  state.wound = clamp(state.wound, 0, 1)

  if (state.wound < 1) return 0

  state.gateShut = true
  state.flash.push('gate')
  return finishAct(state)
}

// ---- finishing ------------------------------------------------------------

/** An act falls, the sea takes the next step, and a fragment may appear. */
function finishAct(state: HallState): number {
  state.act += 1
  state.flash.push('act')
  return SURGE_ACT
}

/**
 * The fragments this hall has earned.
 *
 * One per act finished, up to three, and **never one more**. This is the whole
 * of the room's secret-keeping: `publicData()` carries positions and nothing
 * else, so a player reading the network tab learns the code at exactly the
 * speed a player doing the work learns it.
 */
export function earnedFragments(state: HallState): string[] {
  return FRAGMENTS.slice(0, Math.max(0, Math.min(FRAGMENT_ACTS, state.act - 1)))
}

/** Everything the room draws, and nothing it should not know yet. */
export function publicHall(state: HallState, now: number): Record<string, unknown> {
  // Milliseconds left rather than a boolean, so a lamp can be drawn burning
  // down. The room has to be able to show you the thing it is about to take
  // away, or "all five at once" is a rule you can only learn by failing.
  const lamps: Record<string, number> = {}
  for (const lamp of LAMPS) lamps[lamp.id] = Math.max(0, (state.lampOut[lamp.id] ?? 0) - now)

  const wheels: Record<string, number> = {}
  for (const wheel of WHEELS) wheels[wheel.id] = Math.max(0, (state.wheelUntil[wheel.id] ?? 0) - now)

  const paired = state.counted >= 2
  const turns = wantedTurns(state.step)

  return {
    lamps,
    wheels,
    lampLife: LAMP_MS,
    pair: state.act === 1 && paired ? (LAMP_PAIRS[state.pairIndex] ?? null) : null,
    pairsDone: state.pairIndex,
    pairsNeeded: LAMP_PAIRS.length,
    // The seating order only appears once the act that needs it begins — it is
    // painted on the tide staff, and the staff is under water until then.
    order: state.act === 2 ? [...ORDER] : null,
    seated: [...state.seated],
    carrying: { ...state.carrying },
    channel: state.act === 2 && paired,
    // Alone, the whole pattern; together, only the plaques — and each plaque
    // describes the *far* wheel. That is the puzzle, not a mistake.
    sequence: state.act === 3 && !paired ? SEQUENCE.map((step) => ({ ...step })) : null,
    step: state.step,
    steps: paired ? ROUNDS : SEQUENCE.length,
    signWest: state.act === 3 && paired ? turns.east : null,
    signEast: state.act === 3 && paired ? turns.west : null,
    wound: state.wound,
    gateShut: state.gateShut,
    fragments: earnedFragments(state),
    keypadDrowned: state.depth > KEYPAD_DEPTH,
    radius: STATION_RADIUS,
    flash: [...state.flash],
    says: { ...state.says },
  }
}

/**
 * Which way the sea is going, in the three words the gauge has room for.
 *
 * Derived from the **rate** rather than from a count of wheels, because those
 * two stopped agreeing when pump grew past rise: one wheel used to hold the
 * level exactly and now creeps it back, so counting wheels would have the gauge
 * saying "holding" while the water visibly fell.
 *
 * `holding` therefore means *barely moving* — the one-wheel case — which is
 * what a player needs told apart from two wheels actually making progress.
 */
const CREEPING = 0.5

export function tideTrend(state: HallState, now: number): 'rising' | 'holding' | 'falling' {
  let held = 0
  for (const wheel of WHEELS) if ((state.wheelUntil[wheel.id] ?? 0) > now) held += 1

  const rising = RISE_PER_SECOND * (state.gateShut ? SHUT_GATE_RELIEF : 1)
  const rate = rising - PUMP_PER_SECOND * held
  if (rate <= -CREEPING) return 'falling'
  if (rate < 0) return 'holding'
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
