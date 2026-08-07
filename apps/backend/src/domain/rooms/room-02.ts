import type { RoomDefinition } from '../room-definition.js'
import { asText } from '../answer.js'

/**
 * Room 2 — Genesis Protocol. Answer type: text.
 *
 * The puzzle itself (locations, terminals, code locks, the power router, the
 * evacuation timer) is a self-contained experience owned by the frontend
 * folder at `apps/frontend/src/rooms/room-02/` — this room has no dynamic
 * `publicData()` to hand over. The one thing that has to be server-authoritative
 * is the exit override, so that is the only value this file ever checks.
 */
const SOLUTION = 'SEVERE'

export const room02: RoomDefinition = {
  id: 'room-02',
  title: 'Genesis Protocol',
  intro:
    'The power failed while you were still inside Kepler Biogenetics, Site 9. Something else got out when it did.',
  prompt:
    'Investigate the facility, recover what the company tried to bury, and clear the emergency exit before containment fails. Submit the exit override once you have it.',

  hints: [
    'Start in the laboratory: the DNA analysis station and the recovered audio log both hide pieces of the story.',
    'The exit override is not typed at random — it is the aggression classification the DNA station assigns the specimen that got loose.',
    'Reopen the DNA Analysis Station and read its final line: "Aggression index: ___." That word is the override.',
  ],

  publicData() {
    return {}
  },

  check(answer) {
    const text = asText(answer)
    if (text === null) {
      return { correct: false, feedback: 'Type the override as text.' }
    }
    if (text === SOLUTION) {
      return { correct: true }
    }
    return { correct: false, feedback: 'Override rejected.' }
  },
}
