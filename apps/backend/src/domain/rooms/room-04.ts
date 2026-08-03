import type { RoomDefinition } from '../room-definition.js'
import { asNumber } from '../answer.js'

/**
 * Room 4 — The Door. Answer type: number, from arithmetic.
 *
 * PLACEHOLDER PUZZLE. The owning sub-team replaces the content of this file.
 */
const DIGITS = [4, 8, 15, 16, 23, 42] as const
const SOLUTION = DIGITS.reduce((total, digit) => total + digit, 0)

export const room04: RoomDefinition = {
  id: 'room-04',
  title: 'The Door',
  intro: 'The last door. Six numbers are stencilled above the keypad, and the keypad wants only one.',
  prompt: 'One number opens it. The six above the keypad are the whole instruction.',

  hints: [
    'You do not need to reorder them or decode them.',
    'The keypad wants a single total.',
    'Add all six together.',
  ],

  publicData() {
    return { digits: [...DIGITS] }
  },

  check(answer) {
    const value = asNumber(answer)
    if (value === null) {
      return { correct: false, feedback: 'The keypad takes a number.' }
    }
    if (value === SOLUTION) {
      return { correct: true }
    }
    return {
      correct: false,
      feedback: value > SOLUTION ? 'The keypad flashes red. Too high.' : 'Too low.',
    }
  },
}
