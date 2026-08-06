import type { LiveRoom, RoomPublicData } from '@escape-room/shared'

/**
 * Reading what the server sends about the hall.
 *
 * Both halves arrive typed as `Record<string, unknown>` — the floor plan in
 * `room.data` and the live state in `live.detail` — because that is the seam
 * that lets a room own its own shape without every other room's payload
 * appearing in `packages/shared` (ADR-0007, and the note on `liveRoomSchema`).
 *
 * The price of that seam is exactly this file: narrowing happens **here, in the
 * room**, and never in the shell. Everything below tolerates a missing or
 * malformed field and answers with something drawable, because the alternative
 * to a defaulted lamp is a white screen twice a second.
 */

export interface Spot {
  id: string
  x: number
  y: number
}

export interface HallLayout {
  wheels: Spot[]
  lamps: Spot[]
  pedestals: Spot[]
  tablets: Spot[]
  keypad: Spot
  channel: { minX: number; maxX: number }
  radius: number
}

export interface HallDetail {
  lamps: Record<string, boolean>
  wheels: Record<string, boolean>
  /** Act I with two players: the pair the hall is asking for right now. */
  pair: [string, string] | null
  pairsDone: number
  /** Act II: the seating order, painted on the depth staff. Null until the act begins. */
  order: string[] | null
  seated: string[]
  carrying: Record<string, string>
  channel: boolean
  turns: number
  /** Act III with two players: what the plaque at *this* end says about the far wheel. */
  signWest: number | null
  signEast: number | null
  ratchetAt: string | null
  ratchetHeld: number
  fragments: string[]
  keypadDrowned: boolean
  /** Things that just happened and want a noise. */
  flash: string[]
}

const NO_SPOT: Spot = { id: '', x: 0, y: 0 }

export function readLayout(data: RoomPublicData['data']): HallLayout | null {
  const hall = asRecord(data.hall)
  if (!hall) return null

  return {
    wheels: spots(hall.wheels),
    lamps: spots(hall.lamps),
    pedestals: spots(hall.pedestals),
    tablets: spots(hall.tablets),
    keypad: spots([hall.keypad])[0] ?? NO_SPOT,
    channel: {
      minX: num(asRecord(hall.channel)?.minX, 0),
      maxX: num(asRecord(hall.channel)?.maxX, 0),
    },
    radius: num(hall.radius, 95),
  }
}

export function readDetail(live: LiveRoom | null): HallDetail {
  const detail = live?.detail ?? {}

  return {
    lamps: flags(detail.lamps),
    wheels: flags(detail.wheels),
    pair: pairOf(detail.pair),
    pairsDone: num(detail.pairsDone, 0),
    order: Array.isArray(detail.order) ? detail.order.filter(isText) : null,
    seated: Array.isArray(detail.seated) ? detail.seated.filter(isText) : [],
    carrying: strings(detail.carrying),
    channel: detail.channel === true,
    turns: num(detail.turns, 0),
    signWest: facing(detail.signWest),
    signEast: facing(detail.signEast),
    ratchetAt: isText(detail.ratchetAt) ? detail.ratchetAt : null,
    ratchetHeld: num(detail.ratchetHeld, 0),
    fragments: Array.isArray(detail.fragments) ? detail.fragments.filter(isText) : [],
    keypadDrowned: detail.keypadDrowned === true,
    flash: Array.isArray(detail.flash) ? detail.flash.filter(isText) : [],
  }
}

/** How near counts as here — the same number the server is deciding with. */
export function within(spot: Spot, x: number, y: number, radius: number): boolean {
  return Math.hypot(x - spot.x, y - spot.y) <= radius
}

function spots(value: unknown): Spot[] {
  if (!Array.isArray(value)) return []
  return value
    .map((entry) => asRecord(entry))
    .filter((entry): entry is Record<string, unknown> => entry !== null)
    .filter((entry) => isText(entry.id))
    .map((entry) => ({ id: String(entry.id), x: num(entry.x, 0), y: num(entry.y, 0) }))
}

function pairOf(value: unknown): [string, string] | null {
  if (!Array.isArray(value) || value.length !== 2) return null
  const [first, second] = value
  return isText(first) && isText(second) ? [first, second] : null
}

function flags(value: unknown): Record<string, boolean> {
  const record = asRecord(value)
  if (!record) return {}
  const out: Record<string, boolean> = {}
  for (const [key, entry] of Object.entries(record)) out[key] = entry === true
  return out
}

function strings(value: unknown): Record<string, string> {
  const record = asRecord(value)
  if (!record) return {}
  const out: Record<string, string> = {}
  for (const [key, entry] of Object.entries(record)) if (isText(entry)) out[key] = entry
  return out
}

/** Only ever 1 or -1 on the wire; anything else is not a direction. */
function facing(value: unknown): number | null {
  return value === 1 || value === -1 ? value : null
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function num(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function isText(value: unknown): value is string {
  return typeof value === 'string'
}
