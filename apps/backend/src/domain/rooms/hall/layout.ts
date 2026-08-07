/**
 * Where everything in the Reading Hall stands.
 *
 * One source for two readers: `publicData()` sends this to the browser so the
 * room can draw itself, and the mechanism next door uses the same numbers to
 * decide who is standing at what. Two copies of a coordinate is how a lamp ends
 * up drawn somewhere you cannot light it.
 *
 * Everything is in the stage's own 1600×900 units, and every station sits
 * inside `WALK_BOUNDS` (x 140–1460, y 690–880) — a station you cannot walk to
 * is a station nobody can use.
 *
 * **Nothing here is a secret.** These are positions, not answers; the room is
 * meant to be legible the moment you walk in. What the server withholds is the
 * code, and that lives in `room-01.ts` and is only ever emitted a fragment at a
 * time as acts are finished (ADR-0006).
 */

export interface Station {
  id: string
  x: number
  /** The ground line, same convention as scenery and players — placed by the feet. */
  y: number
}

/**
 * How close counts as "here".
 *
 * Generous on purpose. The stage is scaled down to a phone at times and a
 * station you have to hit precisely is a station that feels broken on a touch
 * screen. Being lenient costs nothing: **standing** is what engages a station,
 * not merely being near one, so an over-wide radius does not cause accidents.
 */
export const STATION_RADIUS = 95

/**
 * The two sluice wheels, at the far ends.
 *
 * As far apart as the walkable stage allows, which is the entire point: the
 * crossing between them is 1200 units, about three and a half seconds, and that
 * gap is what a second player is actually worth.
 */
export const WHEELS: readonly Station[] = [
  { id: 'wheel-west', x: 200, y: 800 },
  { id: 'wheel-east', x: 1330, y: 800 },
] as const

/**
 * Act IV. The two winches that shut the sluice gate.
 *
 * Nearer each other than the pump wheels, because winding is a long hold rather
 * than a sprint — the distance between them is not the puzzle here, committing
 * to it at the same time is.
 */
export const WINCHES: readonly Station[] = [
  { id: 'winch-west', x: 470, y: 800 },
  { id: 'winch-east', x: 1130, y: 800 },
] as const

/** Act I. Five oil lamps across the hall. */
export const LAMPS: readonly Station[] = [
  { id: 'lamp-0', x: 340, y: 745 },
  { id: 'lamp-1', x: 590, y: 745 },
  { id: 'lamp-2', x: 800, y: 745 },
  { id: 'lamp-3', x: 1010, y: 745 },
  { id: 'lamp-4', x: 1260, y: 745 },
] as const

/** Act II. Five pedestals along the back, five tablets lying at the front. */
export const PEDESTALS: readonly Station[] = [
  { id: 'ped-0', x: 330, y: 700 },
  { id: 'ped-1', x: 520, y: 700 },
  { id: 'ped-2', x: 700, y: 700 },
  { id: 'ped-3', x: 900, y: 700 },
  { id: 'ped-4', x: 1090, y: 700 },
] as const

/** Where each tablet lies when nobody is carrying it. Dropping one sends it home. */
export const TABLETS: readonly Station[] = [
  { id: 'tab-0', x: 250, y: 862 },
  { id: 'tab-1', x: 480, y: 862 },
  { id: 'tab-2', x: 660, y: 862 },
  { id: 'tab-3', x: 960, y: 862 },
  { id: 'tab-4', x: 1180, y: 862 },
] as const

/** Act IV. Low and central, so it is the first thing the water takes. */
export const KEYPAD: Station = { id: 'keypad', x: 800, y: 865 }

/**
 * The order the tablets have to be seated in, read off the tide staff.
 *
 * Chosen rather than sorted: with two players the hall opens a channel down the
 * middle and a tablet cannot be carried through it, so this order is picked to
 * strand **two** of the five on the wrong side. Without those two hand-offs the
 * act would merely be quicker with a friend instead of impossible without one.
 *
 * `ORDER[n]` goes into `PEDESTALS[n]`.
 */
export const ORDER: readonly string[] = ['tab-0', 'tab-3', 'tab-1', 'tab-4', 'tab-2'] as const

/**
 * The flooded channel down the middle of the hall. Two players only.
 *
 * Deliberately narrow. It is not a wall — you can wade across it in a stride,
 * and walking is not what it stops. **What you are carrying goes in the water**,
 * which makes it a rule about tablets rather than a rule about movement, and
 * costs `useMovement` no change at all.
 */
export const CHANNEL = { minX: 770, maxX: 830 } as const

/** Every station in the hall, so a lookup does not have to know which act it is. */
export const STATIONS: readonly Station[] = [
  ...WHEELS,
  ...WINCHES,
  ...LAMPS,
  ...PEDESTALS,
  ...TABLETS,
  KEYPAD,
] as const

export function stationById(id: string): Station | undefined {
  return STATIONS.find((station) => station.id === id)
}

/**
 * Is this player close enough to work this station?
 *
 * Position only. An earlier version also required the player to have *stopped*,
 * which was doing two jobs: telling a deliberate act apart from walking past,
 * and making a twice-a-second position sample enough to run a room on.
 *
 * Pressing E does both of those jobs better and says so out loud, so this is
 * back to being what its name suggests — a distance check, used to decide what
 * the prompt offers and to verify that a station somebody claims to have acted
 * on is one they could actually reach.
 *
 * Deliberately generous, and it can be true while walking. A player who presses
 * E as they arrive should get the thing they were obviously aiming at, not a
 * lesson about coming to a complete stop first.
 */
export function isNear(station: Station, player: { x: number; y: number }): boolean {
  return Math.hypot(player.x - station.x, player.y - station.y) <= STATION_RADIUS
}

/** The public layout, as `publicData()` sends it. Positions only — no answers. */
export function publicLayout() {
  return {
    wheels: WHEELS.map(plain),
    winches: WINCHES.map(plain),
    lamps: LAMPS.map(plain),
    pedestals: PEDESTALS.map(plain),
    tablets: TABLETS.map(plain),
    keypad: plain(KEYPAD),
    channel: { ...CHANNEL },
    radius: STATION_RADIUS,
  }
}

function plain(station: Station) {
  return { id: station.id, x: station.x, y: station.y }
}
