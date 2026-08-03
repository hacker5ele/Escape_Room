import type { RoomDefinition } from '../room-definition.js'
import { asText } from '../answer.js'

/**
 * Room 2 — The Archive. Answer type: text.
 *
 * PLACEHOLDER PUZZLE. The owning sub-team replaces the content of this file.
 */
const SOLUTION = 'ESCAPE ROOM'

/** ROT13 of the solution. Safe to send to the browser — it is the puzzle. */
const CIPHER_TEXT = 'RFPNCR EBBZ'

export const room02: RoomDefinition = {
  id: 'room-02',
  title: 'The Archive',
  intro:
    'Shelves of paper, all of it nonsense. One index card has been pinned to the door at eye height.',
  prompt: 'Two words, scrambled by a very old trick. Type them as they should read.',

  hints: [
    'Every letter has been shifted by the same amount through the alphabet.',
    'The shift is exactly half the alphabet — 13 letters. Shifting again undoes it.',
    'The first letter R becomes E.',
  ],

  publicData() {
    return { cipherText: CIPHER_TEXT, alphabet: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ' }
  },

  check(answer) {
    const text = asText(answer)
    if (text === null) {
      return { correct: false, feedback: 'Type the two words as text.' }
    }
    if (text === SOLUTION) {
      return { correct: true }
    }
    if (text === CIPHER_TEXT) {
      return { correct: false, feedback: 'That is the card as written. Decode it first.' }
    }
    if (text.replace(/\s/g, '') === SOLUTION.replace(/\s/g, '')) {
      return { correct: true }
    }
    return { correct: false, feedback: 'Not it. Check the shift.' }
  },
}
