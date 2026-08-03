import { ROOM_IDS, roomOrder, type RoomId } from './rooms.js'
import type { GameSession } from './session.js'

/**
 * The rule the whole game turns on: a room may be entered once every room
 * before it has been solved.
 *
 * This function exists exactly once, and both sides call it. The backend uses
 * it to decide whether to answer with the room or with 403. The frontend uses
 * it to grey out locked rooms and to redirect. Because it is one function,
 * the UI and the API cannot disagree about what is unlocked.
 *
 * The frontend calling this is a convenience, not a protection — the backend
 * check is the real one. See ADR-0006.
 */
export function isRoomUnlocked(session: GameSession, roomId: RoomId): boolean {
  const precedingRooms = ROOM_IDS.slice(0, roomOrder(roomId) - 1)
  return precedingRooms.every((precedingRoom) => session.solvedRooms.includes(precedingRoom))
}

export function isRoomSolved(session: GameSession, roomId: RoomId): boolean {
  return session.solvedRooms.includes(roomId)
}

/** The room the player should be in right now, or null once every room is solved. */
export function currentRoomId(session: GameSession): RoomId | null {
  return ROOM_IDS.find((roomId) => !isRoomSolved(session, roomId)) ?? null
}

export function isGameComplete(session: GameSession): boolean {
  return currentRoomId(session) === null
}

export function progress(session: GameSession): { solved: number; total: number; percent: number } {
  const solved = ROOM_IDS.filter((roomId) => isRoomSolved(session, roomId)).length
  const total = ROOM_IDS.length
  return { solved, total, percent: Math.round((solved / total) * 100) }
}
