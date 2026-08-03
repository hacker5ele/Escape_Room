import type { RoomId } from '@escape-room/shared'

/**
 * The expected answers, for tests only.
 *
 * Having them here is not a leak — they are in the repository either way, in
 * each room's `check()`. The thing that matters is that they never appear in an
 * HTTP *response*, and `rooms.test.ts` uses this list to prove exactly that.
 *
 * When you change a puzzle, change this too, or the test suite will tell you.
 */
export const SOLUTIONS: Record<RoomId, unknown> = {
  'room-01': 90,
  'room-02': 'SEVERE',
  'room-03': 21,
  'room-04': 108,
}
