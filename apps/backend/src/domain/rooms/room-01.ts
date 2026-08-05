import type { RoomDefinition } from '../room-definition.js'
import { asText } from '../answer.js'

/**
 * Room 1 — The Reading Hall. Theme: the Lost Archive of Alexandria.
 * Answer type: text (a digit code).
 *
 * Ten levels, one after another, cycling through three kinds of challenge —
 * a task, a quiz, a riddle — each drawn from what a scholar in this hall
 * might actually have read: Greek mythology, Homer, Egypt, Rome, and finally
 * the hall's own fire. Getting a level right is what reveals the next one;
 * that gate is cosmetic, checked in the browser, the same way a locked
 * room's frosted glass is cosmetic (ADR-0032) — it is not where the security
 * lives. Each correct level answer gives one digit; the ten combine into the
 * code that opens the vault, and that code is the only thing this room's
 * `check()` ever validates. Nothing about the per-level digits is a secret
 * worth protecting the way the combined code is, so they can live in
 * `publicData` in plain sight.
 */
const SOLUTION = '7931433781'

export const room01: RoomDefinition = {
  id: 'room-01',
  title: 'The Reading Hall',
  intro:
    'The reading hall is dark, lit only by what light finds its way through a collapsed roof. Shelves ' +
    'lean into each other under the weight of scrolls nobody has read in centuries, and dust moves in ' +
    'the draft like something is still breathing in here.',
  prompt:
    'Ten marks are scattered through the hall, each a question out of the old world — Rome, Greece, ' +
    'Egypt, the tales of Troy. Answer each with a single digit to reveal the next, then enter all ten ' +
    'digits in order to open the vault.',

  hints: [
    'Solve the levels in order. Each is a task, a quiz, or a riddle about the old world, and each gives one digit of the code.',
    'Level 1: the shelf-tag numeral VII is 7. Level 2: Greek mythology counts nine Muses.',
    'Level 3: the Sphinx’s riddle ends with someone walking on three legs — a cane, in old age.',
    'Level 4: a Cyclops, like the one Odysseus blinded, has one eye.',
    'Level 5: the numeral IV is 4. Level 6: three pyramids rise together at Giza.',
    'Level 7: Cerberus, guardian of the underworld, has three heads.',
    'Level 8: the ancient Greeks counted seven wonders of the world.',
    'Level 9: the numeral VIII is 8. Level 10: the story told here gives the fire a single night.',
    '7, 9, 3, 1, 4, 3, 3, 7, 8, 1.',
  ],

  publicData() {
    return {
      levels: [
        {
          id: 'bookshelf',
          label: 'A high shelf, a numeral carved into the tag',
          kind: 'task',
          prompt: 'A Roman numeral is carved into the shelf-tag: VII. What number is it?',
          mark: '7',
        },
        {
          id: 'scroll-pile',
          label: 'A pile of scrolls, one unburned',
          kind: 'quiz',
          prompt:
            'In Greek mythology, how many Muses — goddesses of art and memory — were there? The hall ' +
            'next door, the Mouseion, was built in their honour.',
          mark: '9',
        },
        {
          id: 'candle-stand',
          label: 'An iron stand, old wax pooled beneath it',
          kind: 'riddle',
          prompt:
            'The Sphinx once asked every traveller: what walks on four legs at dawn, two at noon, and ' +
            'how many legs by evening?',
          mark: '3',
        },
        {
          id: 'lectern',
          label: 'A lectern at the centre of the hall',
          kind: 'quiz',
          prompt:
            'In Homer’s Odyssey, Odysseus blinds the Cyclops Polyphemus to escape his cave. How many ' +
            'eyes does a Cyclops have?',
          mark: '1',
        },
        {
          id: 'ink-well',
          label: 'A dry inkwell, a numeral scratched beside it',
          kind: 'task',
          prompt: 'A Roman numeral is scratched beside the inkwell: IV. What number is it?',
          mark: '4',
        },
        {
          id: 'vellum-rack',
          label: 'A rack of stiff, pale hides, cured long ago',
          kind: 'quiz',
          prompt:
            'How many pyramids rise together at Giza in Egypt — the ones later travellers counted ' +
            'among the wonders of the world?',
          mark: '3',
        },
        {
          id: 'ember-pit',
          label: 'A ring of scorched stones, one coal still glowing',
          kind: 'riddle',
          prompt:
            'I guard the gates of the underworld in the old Greek tales, and no single head is enough ' +
            'for me. How many do the stories give me?',
          mark: '3',
        },
        {
          id: 'broken-column',
          label: 'A fallen column, half sunk into the floor',
          kind: 'quiz',
          prompt:
            'The ancient Greeks counted seven wonders of the world, and one of them — a great ' +
            'lighthouse — stood in this very city. How many wonders did their list have in total?',
          mark: '7',
        },
        {
          id: 'ceiling-beam',
          label: 'A cracked beam overhead, a numeral just visible',
          kind: 'task',
          prompt: 'A Roman numeral is carved into the beam overhead: VIII. What number is it?',
          mark: '8',
        },
        {
          id: 'scorch-mark',
          label: 'A black scorch mark across the floor stones',
          kind: 'riddle',
          prompt:
            'The old story told here says the fire that emptied this hall burned through a single, ' +
            'unlucky night before the roof came down. How many nights does the story give it?',
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
