import type { RoomId } from '@escape-room/shared'

/**
 * The expected answers, for tests only.
 *
 * Having them here is not a leak — they are in the repository either way, in
 * each room's `check()`. The thing that matters is that they never appear in an
 * HTTP *response*, and `rooms.test.ts` uses this list to prove exactly that.
 *
 * When you change a puzzle, change this too, or the test suite will tell you.
 *
 * room-03 is multiple choice, so its "solution" is the letter of the correct
 * option for the first riddle, not the option's text — the text is always
 * visible on screen as one of four choices, which is not a leak. See the
 * `MULTIPLE_CHOICE_ROOMS` note in rooms.test.ts.
 */
export const SOLUTIONS: Record<RoomId, unknown> = {
  'room-01': 90,
  'room-02': 'ESCAPE ROOM',
  'room-03': 'A',
  'room-04': 108,
}
