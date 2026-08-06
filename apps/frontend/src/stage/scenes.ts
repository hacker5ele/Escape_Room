import manifest from './scenery.json'

/**
 * Where the furniture goes.
 *
 * The stage is a fixed 1600×900 coordinate space and everything on it — props,
 * players, positions on the wire — is expressed in those units, then scaled once
 * by CSS. Nothing else has to know the size of the window it ended up in, which
 * is what keeps a friend's position meaningful on a phone and a laptop at once.
 *
 * Props are placed by their **feet**: `x` is the centre of the piece, `y` is the
 * ground it stands on. That is the same convention the players use, which is
 * what lets the two be sorted against each other and makes walking behind the
 * armchair work.
 */

export const STAGE = manifest.stage as [number, number]

/** Where the wall stops and the floor starts. Everything walkable is below it. */
export const HORIZON = 560

/** The box players may walk in. Kept clear of the very back and the very front. */
export const WALK_BOUNDS = { minX: 140, maxX: 1460, minY: 690, maxY: 880 }

export interface Prop {
  piece: string
  x: number
  /** The ground line the piece stands on; also its depth. */
  y: number
  flip?: boolean
  /**
   * Sort key, when it differs from where the piece stands.
   *
   * Only flat things need this — a rug lies at the front of the room but has to
   * draw behind whoever is standing on it.
   */
  depth?: number
  /** Gentle idle movement, for the things that would move in a real room. */
  sway?: 'leaves' | 'swing' | 'tick'
}

export interface Scene {
  wall: string
  floor: string
  props: Prop[]
}

/**
 * The lobby: somewhere comfortable to wait.
 *
 * Props sit left and right of centre because the middle belongs to the players —
 * they line up there, and anything placed centrally would end up behind
 * somebody's head.
 */
const LOBBY: Scene = {
  wall: 'lobby-wall',
  floor: 'lobby-floor',
  // Furniture lines the walls and the far corners; the middle of the floor is
  // left clear because that is where the party stands. Anything placed centrally
  // would end up behind somebody's head.
  props: [
    { piece: 'lobby-window', x: 250, y: 575 },
    { piece: 'lobby-picture-a', x: 700, y: 300 },
    { piece: 'lobby-picture-b', x: 860, y: 290 },
    { piece: 'lobby-clock', x: 1050, y: 300 },
    { piece: 'lobby-radiator', x: 640, y: 620 },
    { piece: 'lobby-coatstand', x: 1500, y: 660 },
    { piece: 'lobby-palm', x: 90, y: 680, sway: 'leaves' },
    { piece: 'lobby-sofa', x: 1180, y: 690 },
    { piece: 'lobby-lamp', x: 1420, y: 700 },
    { piece: 'lobby-armchair', x: 190, y: 720 },
    { piece: 'lobby-table', x: 380, y: 735 },
    { piece: 'lobby-bin', x: 1520, y: 760 },
    // Lies flat, so it draws with the back of the room.
    { piece: 'lobby-rug', x: 800, y: 900, depth: 640 },
  ],
}

/** Room 01: the same stage, somewhere you would rather not be. */
const VAULT: Scene = {
  wall: 'vault-wall',
  floor: 'vault-floor',
  props: [
    { piece: 'vault-vent', x: 300, y: 240 },
    { piece: 'vault-warning', x: 1180, y: 250 },
    { piece: 'vault-clock', x: 1010, y: 270 },
    { piece: 'vault-bulb', x: 520, y: 300, sway: 'swing' },
    { piece: 'vault-chain', x: 1480, y: 470, sway: 'swing' },
    { piece: 'vault-door', x: 800, y: 575 },
    { piece: 'vault-pipes', x: 80, y: 610 },
    { piece: 'vault-locker', x: 1400, y: 670 },
    { piece: 'vault-cabinet', x: 170, y: 700 },
    { piece: 'vault-desk', x: 1200, y: 720 },
    { piece: 'vault-crate-a', x: 330, y: 745 },
    { piece: 'vault-crate-b', x: 470, y: 765, flip: true },
    { piece: 'vault-barrel', x: 1520, y: 780 },
  ],
}

/**
 * Room 01: the Reading Hall, below the harbour and filling up.
 *
 * Only the furniture is here. Everything the hall actually *does* — the lamps,
 * the wheels, the pedestals, the tablets, the water — is drawn by the room
 * itself, because all of it changes twice a second and a scene is a list of
 * things that stand still (ADR-0048).
 *
 * So the floor is left unusually bare. Five lamps, five pedestals, five tablets
 * and two wheels are already standing on it, and a scene prop in the same place
 * is a prop somebody cannot see past while they work.
 */
const HALL: Scene = {
  wall: 'hall-wall',
  floor: 'hall-floor',
  props: [
    // On the wall, above everything, so the floor stays walkable.
    { piece: 'hall-tally', x: 800, y: 300 },
    { piece: 'hall-vault-door', x: 800, y: 585 },
    { piece: 'hall-gearbox', x: 1465, y: 545 },
    { piece: 'hall-tidestaff', x: 95, y: 655 },
    // The far edges, framing the room without standing in it.
    { piece: 'hall-column', x: 40, y: 715 },
    { piece: 'hall-shelf-a', x: 175, y: 690 },
    { piece: 'hall-shelf-b', x: 1335, y: 700 },
    { piece: 'hall-statue', x: 1540, y: 770 },
    { piece: 'hall-amphora', x: 105, y: 878 },
    { piece: 'hall-scroll-pile', x: 1450, y: 852 },
    { piece: 'hall-column-fallen', x: 1560, y: 880 },
    { piece: 'hall-brazier', x: 40, y: 862 },
    // Lies flat at the front — this is where the sea is getting in.
    { piece: 'hall-grate', x: 800, y: 898, depth: 640 },
  ],
}

export const SCENES = { lobby: LOBBY, vault: VAULT, hall: HALL } as const
export type SceneName = keyof typeof SCENES

const PIECES = manifest.pieces as Record<string, { w: number; h: number }>

/** Null for a piece that has not been generated yet, so a missing prop is skipped. */
export function pieceSize(piece: string): { w: number; h: number } | null {
  return PIECES[piece] ?? null
}

export function pieceUrl(piece: string): string {
  return `/scenery/${piece}.webp`
}

/** Dry, and over the head of even the player standing furthest back. */
const FLOOD_DRY = 905
const FLOOD_DROWNED = 300

/**
 * Where the water surface sits, for a room that has one.
 *
 * `depth` runs 0 to 100 on the wire and means nothing in particular until it is
 * put on the stage, which is here — stage geometry belongs with the rest of the
 * stage geometry. The water and the actors standing in it both read this, so
 * "your chin is under" and "the surface is drawn there" cannot disagree.
 *
 * The bottom of the range is just off the front of the floor rather than at it,
 * so a nearly-dry hall still shows a shallow film rather than nothing at all.
 */
export function floodLine(depth: number): number {
  const t = Math.min(1, Math.max(0, depth / 100))
  return FLOOD_DRY - t * (FLOOD_DRY - FLOOD_DROWNED)
}

/**
 * Where each player stands when they arrive.
 *
 * The party lines up across the middle of the stage, spread wider as more people
 * join, and re-centred so the group is always the middle of the picture. Walking
 * moves you off your mark and nothing pulls you back.
 */
export function spawnPoint(index: number, total: number): { x: number; y: number } {
  const spacing = Math.min(260, 900 / Math.max(1, total))
  const offset = (index - (total - 1) / 2) * spacing
  return {
    x: STAGE[0] / 2 + offset,
    // Well forward of the furniture, so the party is in front of the room
    // rather than lost among it. Staggered so a row does not read as one mass.
    y: 800 + (index % 2) * 34,
  }
}
