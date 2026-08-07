import type { RoomDefinition } from '../room-definition.js'
import { asText } from '../answer.js'

/**
 * Room 5 — The Lost Archive. Theme: the lost archive of Alexandria.
 * Answer type: text (a digit code).
 *
 * Ten levels, one after another, cycling through three kinds of challenge —
 * a task, a quiz, a riddle — each drawn from what a scholar in this hall
 * might actually have read: Greek mythology, Homer, Egypt, Rome, and finally
 * the hall's own fire. What you type to solve a level (a name, a word, a
 * number — whatever the question actually calls for) is deliberately not the
 * same thing as the digit it awards: the two are unrelated on purpose, so the
 * questions can be genuine trivia instead of contorted into "how many X".
 * Getting a level right is what reveals the next one; that gate is cosmetic,
 * checked in the browser, the same way a locked room's frosted glass is
 * cosmetic (ADR-0032) — it is not where the security lives. The ten digits
 * combine into the code that opens the vault, and that code is the only
 * thing this room's `check()` ever validates. Nothing about the per-level
 * answers or digits is a secret worth protecting the way the combined code
 * is, so they can live in `publicData` in plain sight.
 */
const SOLUTION = '7931473781'

export const room05: RoomDefinition = {
  id: 'room-05',
  title: 'The Lost Archive',
  intro:
    'The reading hall is dark, lit only by what light finds its way through a collapsed roof. Shelves ' +
    'lean into each other under the weight of scrolls nobody has read in centuries, and dust moves in ' +
    'the draft like something is still breathing in here.',
  prompt:
    'Ten marks are scattered through the hall, each a question out of the old world — Rome, Greece, ' +
    'Egypt, the tales of Troy. Answer each correctly to reveal a mark and move to the next, then enter ' +
    'all ten marks in order to open the vault.',

  hints: [
    'Solve the levels in order. Each is a task, a quiz, or a riddle about the old world, and each one gives a mark toward the ten-digit code.',
    'Level 1: the numeral VII is 7. Level 2: Greek mythology counts nine Muses.',
    'Level 3 is the old Riddle of the Sphinx — the answer is simply "a man".',
    'Level 4: Odysseus blinds the Cyclops named Polyphemus.',
    'Level 5: the numeral IV is 4. Level 6: the queen allied first with Caesar, later with Antony, was Cleopatra.',
    'Level 7: the three-headed hound of the underworld is Cerberus.',
    'Level 8: the wonder that lit this city’s harbour was the Pharos, the lighthouse of Alexandria.',
    'Level 9: the numeral VIII is 8. Level 10: the old story blames Julius Caesar for the fire.',
    'The marks in order: 7, 9, 3, 1, 4, 7, 3, 7, 8, 1.',
  ],

  publicData() {
    return {
      levels: [
        {
          id: 'bookshelf',
          label: 'A high shelf, a numeral carved into the tag',
          kind: 'task',
          prompt: 'A Roman numeral is carved into the shelf-tag: VII. What number is it?',
          accepted: ['7'],
          mark: '7',
        },
        {
          id: 'scroll-pile',
          label: 'A pile of scrolls, one unburned',
          kind: 'quiz',
          prompt:
            'In Greek mythology, how many Muses — goddesses of art and memory — were there? The hall ' +
            'next door, the Mouseion, was built in their honour.',
          accepted: ['9'],
          mark: '9',
        },
        {
          id: 'candle-stand',
          label: 'An iron stand, old wax pooled beneath it',
          kind: 'riddle',
          prompt:
            'An old riddle is scratched beneath the wax: what walks on four legs in the morning, two ' +
            'legs at noon, and three legs in the evening?',
          accepted: ['MAN', 'A MAN', 'HUMAN', 'A HUMAN', 'PERSON', 'HUMANKIND'],
          mark: '3',
        },
        {
          id: 'lectern',
          label: 'A lectern at the centre of the hall',
          kind: 'quiz',
          prompt:
            'In Homer’s Odyssey, Odysseus escapes a cave by blinding its one-eyed giant. What is the ' +
            'giant’s name?',
          accepted: ['POLYPHEMUS'],
          mark: '1',
        },
        {
          id: 'ink-well',
          label: 'A dry inkwell, a numeral scratched beside it',
          kind: 'task',
          prompt: 'A Roman numeral is scratched beside the inkwell: IV. What number is it?',
          accepted: ['4'],
          mark: '4',
        },
        {
          id: 'vellum-rack',
          label: 'A rack of stiff, pale hides, cured long ago',
          kind: 'quiz',
          prompt:
            'Which Egyptian queen, the last active ruler of the Ptolemaic line, was allied first with ' +
            'Julius Caesar and later with Mark Antony?',
          accepted: ['CLEOPATRA'],
          mark: '7',
        },
        {
          id: 'ember-pit',
          label: 'A ring of scorched stones, one coal still glowing',
          kind: 'riddle',
          prompt:
            'In the old Greek tales, I guard the gates of the underworld, and one head was never ' +
            'enough for me. Name me.',
          accepted: ['CERBERUS'],
          mark: '3',
        },
        {
          id: 'broken-column',
          label: 'A fallen column, half sunk into the floor',
          kind: 'quiz',
          prompt:
            'One of the Seven Wonders of the Ancient World stood in the harbour of this very city, its ' +
            'fire guiding ships home by night. What was it called?',
          accepted: [
            'PHAROS',
            'THE PHAROS',
            'LIGHTHOUSE',
            'THE LIGHTHOUSE',
            'PHAROS OF ALEXANDRIA',
            'THE LIGHTHOUSE OF ALEXANDRIA',
          ],
          mark: '7',
        },
        {
          id: 'ceiling-beam',
          label: 'A cracked beam overhead, a numeral just visible',
          kind: 'task',
          prompt: 'A Roman numeral is carved into the beam overhead: VIII. What number is it?',
          accepted: ['8'],
          mark: '8',
        },
        {
          id: 'scorch-mark',
          label: 'A black scorch mark across the floor stones',
          kind: 'riddle',
          prompt:
            'The old story blames one Roman general for the fire that finally emptied this hall — his ' +
            'ships burned in the harbour below, and the flames did not stop where he meant them to. Who?',
          accepted: ['CAESAR', 'JULIUS CAESAR'],
          mark: '1',
        },
      ],
    }
  },

  check(answer) {
    const text = asText(answer)
    if (text === null) {
      return { correct: false, feedback: 'Enter the code the marks spell.' }
    }

    const digits = text.replace(/\s+/g, '')
    if (digits === SOLUTION) {
      return { correct: true }
    }
    if (!/^\d+$/.test(digits)) {
      return { correct: false, feedback: 'The code is digits only.' }
    }
    if (digits.length !== SOLUTION.length) {
      return { correct: false, feedback: `The code is ${SOLUTION.length} digits long.` }
    }
    return { correct: false, feedback: 'Not it. Check each mark again.' }
  },
}
