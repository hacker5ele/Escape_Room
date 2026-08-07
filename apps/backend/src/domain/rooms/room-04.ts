import type { RoomDefinition } from '../room-definition.js'
import { asNumber } from '../answer.js'

const DIGITS = [6, 9, 11, 14, 18, 23] as const
const SOLUTION = DIGITS.filter((digit) => digit % 2 !== 0).reduce((total, digit) => total + digit, 0)

export const room04: RoomDefinition = {
  id: 'room-04',
  title: 'The Abandoned City',
  intro: 'The last door. Six numbers are stencilled above the keypad, but the keypad does not answer to all of them.',
  prompt: 'The keypad wants a single number, built from only some of the six above it.',

  hints: [
    'Not every number above the keypad counts.',
    'The keypad only listens to the odd ones.',
    'Add the odd numbers together and enter the total.',
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
