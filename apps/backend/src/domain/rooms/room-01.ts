import type { RoomDefinition } from '../room-definition.js'
import { asNumber } from '../answer.js'

/**
 * Room 1 — The Server Room. Answer type: number.
 *
 * PLACEHOLDER PUZZLE. The owning sub-team replaces the content of this file.
 * Keep the shape: `publicData` never returns the solution, `check` is the only
 * place it appears.
 */
const SOLUTION = 90

export const room01: RoomDefinition = {
  id: 'room-01',
  title: 'The Server Room',
  intro:
    'The door clicks shut behind you. A single rack hums in the dark, and one display is still lit.',
  prompt: 'The lock wants a decimal number. The display only speaks binary.',

  hints: [
    'Read the digits from right to left. Each position is worth twice the one before it.',
    'The positions are 64, 32, 16, 8, 4, 2, 1 — add up the ones where the digit is 1.',
    'It is 64 + 16 + 8 + 2.',
  ],

  publicData() {
    return { binary: '1011010' }
  },

  check(answer) {
    const value = asNumber(answer)
    if (value === null) {
      return { correct: false, feedback: 'The lock takes digits only.' }
    }
    if (value === SOLUTION) {
      return { correct: true }
    }
    if (value === 1011010) {
      return { correct: false, feedback: 'That is the binary itself. Convert it first.' }
    }
    return {
      correct: false,
      feedback: value > SOLUTION ? 'Too high.' : 'Too low.',
    }
  },
}
