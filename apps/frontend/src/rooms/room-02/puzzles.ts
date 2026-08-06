import { LOCKS, STORY, type LockKind } from './story'

/** Same normalization the original lock input used: trim, lowercase, drop whitespace. */
export function normalizeLockInput(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, '')
}

export function isLockAnswerCorrect(kind: LockKind, input: string): boolean {
  return normalizeLockInput(input) === LOCKS[kind].answer
}

/** The evidence puzzle is a decision, not a code: pick exactly the damning documents. */
export function isEvidenceSelectionCorrect(selected: ReadonlySet<string>): boolean {
  const damningIds = STORY.evidenceItems.filter((item) => item.damning).map((item) => item.id)
  return selected.size === damningIds.length && damningIds.every((id) => selected.has(id))
}

export function shuffle<T>(items: readonly T[]): T[] {
  const copy = [...items]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    // Both indices are in bounds by construction (i from length-1 down to 1, j
    // from 0 to i), so the non-null assertions are just telling TypeScript what
    // the Fisher-Yates invariant already guarantees.
    ;[copy[i], copy[j]] = [copy[j]!, copy[i]!]
  }
  return copy
}

/** Darkens a hex color for a terminal's border, same as the original wire board. */
export function shadeColor(hex: string): string {
  const num = parseInt(hex.slice(1), 16)
  const r = Math.max(0, (num >> 16) - 40)
  const g = Math.max(0, ((num >> 8) & 0xff) - 40)
  const b = Math.max(0, (num & 0xff) - 40)
  return `rgb(${r},${g},${b})`
}

// ---- Signal-repair circuit (gates the recovered audio log) ------------------
// A small grid of rotatable pipe segments. Each tile has a fixed shape and a
// fixed required edge set; the player rotates tiles until every segment
// exposes its required edges, forming one unbroken run from PWR to SPK.

export type CircuitEdge = 'T' | 'R' | 'B' | 'L'
export type CircuitShape = 'straight' | 'corner'

export interface CircuitTile {
  row: number
  col: number
  shape: CircuitShape
  /** The edges this tile must expose, once correctly rotated, to be part of the run. */
  solvedEdges: readonly CircuitEdge[]
}

const EDGE_ORDER: readonly CircuitEdge[] = ['T', 'R', 'B', 'L']

/** The edges a shape exposes at rotation 0 — what the CSS draws before any rotation is applied. */
const SHAPE_BASE_EDGES: Record<CircuitShape, readonly CircuitEdge[]> = {
  straight: ['L', 'R'],
  corner: ['T', 'R'],
}

function rotateEdge(edge: CircuitEdge, steps: number): CircuitEdge {
  const index = (EDGE_ORDER.indexOf(edge) + steps) % EDGE_ORDER.length
  return EDGE_ORDER[index] as CircuitEdge
}

/** The edges a tile currently exposes, given how many quarter-turns it's been clicked. */
export function circuitOpenEdges(shape: CircuitShape, rotation: number): Set<CircuitEdge> {
  const steps = ((rotation % 4) + 4) % 4
  return new Set(SHAPE_BASE_EDGES[shape].map((edge) => rotateEdge(edge, steps)))
}

function edgeSetsEqual(open: Set<CircuitEdge>, required: readonly CircuitEdge[]): boolean {
  return open.size === required.length && required.every((edge) => open.has(edge))
}

export const CIRCUIT_GRID_ROWS = 3
export const CIRCUIT_GRID_COLS = 4

// PWR feeds in on the left of the top row, SPK exits on the right of the top
// row; the run drops through all three rows before climbing back up, so it's
// a real trace-the-path puzzle instead of one loop. Cells not listed here are
// dead, non-interactive filler.
export const CIRCUIT_PATH: readonly CircuitTile[] = [
  { row: 0, col: 0, shape: 'corner', solvedEdges: ['L', 'B'] },
  { row: 1, col: 0, shape: 'straight', solvedEdges: ['T', 'B'] },
  { row: 2, col: 0, shape: 'corner', solvedEdges: ['T', 'R'] },
  { row: 2, col: 1, shape: 'straight', solvedEdges: ['L', 'R'] },
  { row: 2, col: 2, shape: 'corner', solvedEdges: ['L', 'T'] },
  { row: 1, col: 2, shape: 'corner', solvedEdges: ['B', 'R'] },
  { row: 1, col: 3, shape: 'corner', solvedEdges: ['L', 'T'] },
  { row: 0, col: 3, shape: 'corner', solvedEdges: ['B', 'R'] },
]

export function circuitTileKey(row: number, col: number): string {
  return `${row}-${col}`
}

export function isCircuitTileSolved(tile: CircuitTile, rotation: number): boolean {
  return edgeSetsEqual(circuitOpenEdges(tile.shape, rotation), tile.solvedEdges)
}

export function isCircuitSolved(rotations: Readonly<Record<string, number>>): boolean {
  return CIRCUIT_PATH.every((tile) =>
    isCircuitTileSolved(tile, rotations[circuitTileKey(tile.row, tile.col)] ?? 0),
  )
}

/** A rotation guaranteed NOT to already satisfy the tile, so the puzzle never starts pre-solved. */
export function randomUnsolvedRotation(tile: CircuitTile): number {
  const candidates = [0, 1, 2, 3].filter((r) => !isCircuitTileSolved(tile, r))
  return candidates[Math.floor(Math.random() * candidates.length)] ?? 0
}
