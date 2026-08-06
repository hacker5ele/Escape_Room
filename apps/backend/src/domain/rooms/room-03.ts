import type { RoomDefinition } from '../room-definition.js'
import { asNumber } from '../answer.js'

/**
 * Room 3 — The Laboratory. Answer type: number, from a sequence.
 *
 * PLACEHOLDER PUZZLE. The owning sub-team replaces the content of this file.
 */
const SEQUENCE = [2, 3, 5, 8, 13] as const
const SOLUTION = 21

export const room03: RoomDefinition = {
  id: 'room-03',
  title: 'The Laboratory',
  intro:
    'Five numbered dials, and a sixth that spins freely. Someone scratched a note into the bench.',
  prompt: 'Set the sixth dial to the number that continues the sequence.',

  hints: [
    'Look at how each number relates to the ones before it, not to its position.',
    'Add two neighbours together and see where you land.',
    '8 + 13.',
  ],

  publicData() {
    return { sequence: [...SEQUENCE] }
  },

  check(answer) {
    const value = asNumber(answer)
    if (value === null) {
      return { correct: false, feedback: 'The dial only takes a number.' }
    }
    if (value === SOLUTION) {
      return { correct: true }
    }
    if (value === 20) {
      return { correct: false, feedback: 'Close, but the step is not fixed. It grows.' }
    }
    return { correct: false, feedback: 'The dial does not move.' }
  },
}
