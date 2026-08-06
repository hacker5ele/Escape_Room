import type { RoomDefinition } from '../room-definition.js'
import { asText } from '../answer.js'
import { HALL_CODE } from './hall/hall.js'
import { publicLayout } from './hall/layout.js'

/**
 * Room 1 — The Reading Hall. Theme: the lost archive of Alexandria, under the
 * harbour. Answer type: text (a six-digit code).
 *
 * **This room is a place rather than a question.** Everything in it is done by
 * standing somewhere — lighting the lamps, carrying the tablets, turning the
 * wheels — and the only thing anybody types in the whole hall is the code at
 * the vault door. The mechanism lives in `hall/` and runs on the heartbeat,
 * because the water rises whether anybody is typing or not and both players
 * have to be looking at the same water (ADR-0048).
 *
 * **What `publicData` sends is a floor plan.** Positions, and nothing else.
 * The code is three fragments and the server does not send a fragment until
 * the act that awards it is genuinely finished, so opening the network tab
 * tells a player exactly what playing tells them and no sooner. That is a
 * stronger reading of ADR-0006 than a payload that merely omits the final
 * answer — there is nothing here to work backwards from.
 */
const SOLUTION = HALL_CODE

export const room01: RoomDefinition = {
  id: 'room-01',
  title: 'The Reading Hall',
  intro:
    'The hall is below the harbour, and the harbour has found it. Water is already over the ' +
    'flagstones, the lamps are cold, and somewhere behind the shelves a sluice is running the ' +
    'wrong way. The scrolls are long gone. The door at the far end is not.',
  prompt:
    'Light the hall, set the index in order, and open the sluice. Each of the three gives you two ' +
    'figures of the code. The wheels at either end hold the water back — but only while somebody ' +
    'is standing at them.',

  hints: [
    'Nothing in here is clicked. Walk to a thing and stop, and you are working it — walking past does nothing at all.',
    'The wheels at the far ends pump. One of them held keeps the water level; both held pushes it back down. Alone that means sprinting, because a wheel keeps turning for about five seconds after you let go.',
    'The lamps burn for twelve seconds each, so the order you light them in is the puzzle: start with the ones furthest from where you want to finish.',
    'The tablets go into the pedestals left to right, in the order painted on the depth staff — not the order you find them in. A wrong one is spat back and the sea takes it personally.',
    'The vault will not take a code while it is under water. Get the level down first, and if there are two of you, one of you has to stay on a wheel while the other types.',
  ],

  publicData() {
    // The floor plan only. Everything that changes — the water, which lamps are
    // lit, which tablets are seated, and the fragments earned so far — arrives
    // on the heartbeat, from the server, as it is earned.
    return { hall: publicLayout() }
  },

  check(answer) {
    const text = asText(answer)
    if (text === null) {
      return { correct: false, feedback: 'The vault wants the six figures.' }
    }

    const digits = text.replace(/\s+/g, '')
    if (digits === SOLUTION) {
      return { correct: true }
    }
    if (!/^\d*$/.test(digits)) {
      return { correct: false, feedback: 'Figures only.' }
    }
    if (digits.length !== SOLUTION.length) {
      return { correct: false, feedback: `The vault takes ${SOLUTION.length} figures.` }
    }
    return { correct: false, feedback: 'The bolt does not move. The water does.' }
  },
}
