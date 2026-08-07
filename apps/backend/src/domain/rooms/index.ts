import { ROOM_IDS, type RoomId } from '@escape-room/shared'
import type { RoomDefinition } from '../room-definition.js'
import { room01 } from './room-01.js'
import { room02 } from './room-02.js'
import { room03 } from './room-03.js'
import { room04 } from './room-04.js'
import { room05 } from './room-05.js'

/**
 * The room registry.
 *
 * This is the only file every sub-team touches, and the only line each of them
 * adds. Everything else about a room lives in its own file. See ADR-0007.
 *
 * Typing it as `Record<RoomId, RoomDefinition>` means the compiler refuses to
 * build if a room listed in the shared `ROOM_IDS` has no implementation here.
 */
export const ROOMS: Record<RoomId, RoomDefinition> = {
  'room-01': room01,
  'room-02': room02,
  'room-03': room03,
  'room-04': room04,
  'room-05': room05,
}

/** The rooms in playing order. */
export const ORDERED_ROOMS: readonly RoomDefinition[] = ROOM_IDS.map((roomId) => ROOMS[roomId])

export function getRoom(roomId: RoomId): RoomDefinition {
  return ROOMS[roomId]
}
