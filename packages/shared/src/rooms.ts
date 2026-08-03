import { z } from 'zod'

/**
 * The rooms of the game, in the order they are played.
 *
 * This list is part of the interface contract: adding or removing a room here
 * is a contract change and needs an ADR. Both registries — the backend's
 * `domain/rooms/index.ts` and the frontend's `rooms/registry.ts` — must agree
 * with this list, and the backend has a test that enforces it.
 */
export const ROOM_IDS = ['room-01', 'room-02', 'room-03', 'room-04'] as const

export type RoomId = (typeof ROOM_IDS)[number]

export const roomIdSchema = z.enum(ROOM_IDS)

/** Position of a room in the sequence, starting at 1. */
export function roomOrder(roomId: RoomId): number {
  return ROOM_IDS.indexOf(roomId) + 1
}

export function isRoomId(value: unknown): value is RoomId {
  return typeof value === 'string' && (ROOM_IDS as readonly string[]).includes(value)
}

/** What the player is shown about a room before entering it. Never includes puzzle data. */
export const roomSummarySchema = z.object({
  id: roomIdSchema,
  order: z.number().int().positive(),
  title: z.string(),
  unlocked: z.boolean(),
  solved: z.boolean(),
})

export type RoomSummary = z.infer<typeof roomSummarySchema>

/**
 * Everything the browser receives about a room the player has entered.
 *
 * There is deliberately no `solution` field. The answer never leaves the
 * server — see ADR-0006. `data` carries whatever the puzzle needs to render:
 * a cipher text, a sequence of numbers, an image reference.
 */
export const roomPublicDataSchema = z.object({
  id: roomIdSchema,
  order: z.number().int().positive(),
  title: z.string(),
  intro: z.string(),
  prompt: z.string(),
  data: z.record(z.string(), z.unknown()),
  hintsAvailable: z.number().int().nonnegative(),
})

export type RoomPublicData = z.infer<typeof roomPublicDataSchema>
