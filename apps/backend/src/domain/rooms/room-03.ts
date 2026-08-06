import type { RoomDefinition } from '../room-definition.js'
import { asText } from '../answer.js'

/**
 * Room 3 — The Sphinx's Reckoning. Answer type: multiple choice (A-D).
 *
 * Five riddles, answered in order. A wrong answer sends the player back to
 * the first riddle — there is no partial credit, same as the source material
 * this room is adapted from.
 *
 * There is no dedicated "which riddle am I on" field on the session (adding
 * one would be a shared-contract change). Instead, stage is derived from the
 * player's own attempt history for this room: count how many *correct*
 * attempts they have logged for room-03, in a row, since their last wrong
 * one. That count is the index of the riddle they are on now.
 */
interface Riddle {
  readonly title: string
  readonly text: string
  readonly choices: readonly [string, string, string, string]
  /** Index into `choices`. */
  readonly correct: 0 | 1 | 2 | 3
  readonly hint: string
  /** What the Sphinx says after this riddle is answered correctly. */
  readonly afterCorrect: string
}

// Five riddles, each a real riddle documented in actual antiquity — not
// modern lateral-thinking riddles dressed up as old. Presented at their
// real difficulty: the true wording, and choices that are each independently
// plausible for the setup (so the answer has to be reasoned out, not
// pattern-matched against an obviously-off distractor).
const SPHINX_RIDDLES: readonly Riddle[] = [
  {
    title: 'The Oldest Written Riddle',
    // Sumer, c. 2000 BC, preserved on a cuneiform tablet — the oldest
    // riddle known to survive in writing.
    text: 'There is a house. One enters it blind and comes out seeing. What is it?',
    choices: ['A school', 'A temple', 'A tomb', 'A womb'],
    correct: 0,
    hint: '"Blind" and "seeing" are not about the eyes here.',
    afterCorrect: 'You did not reach for the coin. Most do. Continue.',
  },
  {
    title: "Plato's Riddle",
    // Referenced in Plato's Republic, c. 4th century BC — a triple
    // paradox: a "man who is not a man" (a eunuch), a "bird that was not
    // a bird" (a bat), a "branch that was not a branch" (a reed), and a
    // "rock that was not a rock" (a pumice stone, which floats).
    text: 'A man who is not a man, seeing and not seeing, threw and did not throw a rock that was not a rock, at a bird that was not a bird, perched on a branch that was not a branch. What kind of person was he, and what did he strike at?',
    choices: [
      'A blind beggar, throwing a clay shard at a crow',
      'A sleeping soldier, dreaming he threw his shield at an owl',
      'A eunuch with poor eyesight, throwing a pumice stone at a bat perched on a reed',
      'A child, throwing a snowball at a sparrow on a fence',
    ],
    correct: 2,
    hint: 'Each "not" describes something real that only resembles the ordinary word used for it.',
    afterCorrect: 'It has watched me for four thousand years and told no one anything. Neither will you, if you are wise.',
  },
  {
    title: "Homer's Riddle",
    // Ancient Greek legend (recorded by Pseudo-Herodotus and others):
    // Homer, told by an oracle he would die when he failed to solve a
    // riddle, met young fishermen who posed this to him — and by legend,
    // his failure to solve it led to his death.
    text: 'Fishermen were asked what they had caught. They answered: "What we caught, we left behind; what we did not catch, we carry with us." What did they carry?',
    choices: ['Their empty nets', 'The smell of the sea', 'Debts owed to the harbor', 'Lice, picked from their clothes'],
    correct: 3,
    hint: 'They were not fishing when this was asked.',
    afterCorrect: 'Even stone remembers warmth it never chose to feel. Go on.',
  },
  {
    title: 'The Riddle of the Bookworm',
    // Exeter Book Riddle 47, Old English, recorded in the 10th-century
    // Exeter Book manuscript (the riddles themselves believed older) —
    // one of the most discussed of the ~90 surviving Exeter riddles.
    text: 'A moth ate words. To me that seemed a strange fate, that the worm should swallow the speech of a man — a thief in the darkness, feeding on a sentence glorious and strong. Yet the thieving guest was no wiser for the words it had swallowed. What is the moth, and what is truly being said about it?',
    choices: [
      'It is a real moth, and the poem laments a ruined manuscript',
      'It is a metaphor for a lazy student who reads without studying',
      'It is a scribe, and the riddle mocks careless copying of old poems',
      'It is a bookworm eating a page, and devouring words grants it no understanding of them',
    ],
    correct: 3,
    hint: 'Take "ate words" literally.',
    afterCorrect: 'The sand outside has buried kings. It will not notice you either way.',
  },
  {
    title: 'The Riddle of the Sphinx',
    // The original — Oedipus and the Sphinx, as told since antiquity.
    // Phrased close to the traditional wording so the historical riddle
    // itself is recognizable, with choices that are still each internally
    // plausible against the three-stage clue.
    text: 'What walks on four legs in the morning, on two legs at noon, and on three legs in the evening?',
    choices: ['A dog that is trained to beg', 'A human being, across one lifetime', 'A table that loses a leg with age', 'A crab, across the tides of one day'],
    correct: 1,
    hint: 'Morning, noon, and evening are not one day here.',
    afterCorrect: '...Then perhaps you were worth waking for.',
  },
]

const LETTERS = ['A', 'B', 'C', 'D'] as const

/**
 * Three hearts, shared across this room's whole run — the Sphinx riddles,
 * the Atlantis quest, and the Olympus carpet race that follow it in the
 * frontend (see ADR-0066, ADR-0070). Losing the last one anywhere sends the
 * player back to riddle 1 here, the only place hearts are tracked
 * server-side.
 */
const MAX_HEARTS = 3

interface Progress {
  /** Which riddle the player is on now, 0-indexed. */
  stage: number
  /** Hearts remaining in the current run. A wrong answer costs one. */
  hearts: number
}

/**
 * Replays this player's whole room-03 attempt history to derive where they
 * are now — the "no dedicated progress field, derive it from the event
 * log" approach ADR-0065 established, still tracking hearts (ADR-0066).
 *
 * A wrong answer costs a heart and the player retries the SAME riddle —
 * losing a heart is a real, felt setback without being a full restart. Only
 * losing the last heart sends them back to riddle 1, with a fresh set of
 * hearts, because that's what "you lost this run" means.
 */
function currentProgress(session: {
  events: readonly { type: string; roomId?: string; correct?: boolean }[]
}): Progress {
  const attempts = session.events.filter((event) => event.type === 'attempt' && event.roomId === 'room-03')

  let stage = 0
  let hearts = MAX_HEARTS
  for (const attempt of attempts) {
    if (attempt.correct) {
      stage += 1
      if (stage >= SPHINX_RIDDLES.length) return { stage: SPHINX_RIDDLES.length - 1, hearts }
    } else {
      hearts -= 1
      if (hearts <= 0) {
        stage = 0
        hearts = MAX_HEARTS
      }
    }
  }
  return { stage, hearts }
}

/** SPHINX_RIDDLES[stage], with the array bound enforced once instead of at each call site. */
function riddleAt(stage: number): Riddle {
  const riddle = SPHINX_RIDDLES[stage] ?? SPHINX_RIDDLES[0]
  if (!riddle) throw new Error('room-03 has no riddles configured')
  return riddle
}

export const room03: RoomDefinition = {
  id: 'room-03',
  title: "The Sphinx's Reckoning",
  intro: 'You wake beneath the sand, in a chamber sealed for four thousand years. Stone eyes watch you.',
  prompt: 'The Sphinx asks five things, one at a time. Answer wrong, and it asks again from the beginning.',

  hints: SPHINX_RIDDLES.map((riddle) => riddle.hint),

  // Only once the five riddles are genuinely done — currentProgress()
  // clamps `stage` at the last index once they're all correct, and only a
  // full heart-loss reset ever moves it back — can the client-only tail
  // (Atlantis, then the Olympus carpet race) legitimately claim room-03 is
  // complete via POST /api/rooms/:roomId/complete. See ADR-0070.
  canComplete(session) {
    const { stage } = currentProgress(session)
    return stage === SPHINX_RIDDLES.length - 1
  },

  publicData(session) {
    const { stage, hearts } = currentProgress(session)
    const riddle = riddleAt(stage)

    return {
      riddleNumber: stage + 1,
      riddleCount: SPHINX_RIDDLES.length,
      riddleTitle: riddle.title,
      riddleText: riddle.text,
      choices: riddle.choices.map((choice, index) => ({ letter: LETTERS[index], text: choice })),
      // Exposed so the frontend's hearts HUD (shared with Atlantis and
      // Olympus, both client-only from here — see ADR-0066, ADR-0070) can
      // start in sync with the server's own count instead of guessing.
      hearts,
      maxHearts: MAX_HEARTS,
    }
  },

  check(answer, session) {
    const text = asText(answer)
    if (text === null) {
      return { correct: false, feedback: 'Answer with a letter — A, B, C, or D.' }
    }

    // Accept either the letter or the full choice text, case-insensitively —
    // asText() already upper-cases and trims.
    const { stage, hearts } = currentProgress(session)
    const riddle = riddleAt(stage)
    const letterIndex = LETTERS.indexOf(text as (typeof LETTERS)[number])
    const choiceIndex =
      letterIndex !== -1 ? letterIndex : riddle.choices.findIndex((choice) => choice.toUpperCase() === text)

    if (choiceIndex === riddle.correct) {
      const isLastRiddle = stage === SPHINX_RIDDLES.length - 1
      return {
        correct: true,
        // The five riddles are no longer the whole room — Atlantis and the
        // Olympus carpet race both follow, entirely client-side, and only
        // POST /api/rooms/:roomId/complete (ADR-0070) actually finishes the
        // room once those are cleared too.
        roomComplete: false,
        feedback: isLastRiddle
          ? 'The hieroglyph wall groans and splits down the middle. You have passed the Reckoning.'
          : riddle.afterCorrect,
      }
    }

    // hearts is the count BEFORE this wrong answer is recorded — the
    // feedback describes what is about to happen once it lands.
    const isLastHeart = hearts <= 1
    return {
      correct: false,
      feedback: isLastHeart
        ? 'Wrong. That was your last chance — the Sphinx starts its questions over.'
        : 'Wrong. Try again.',
    }
  },
}
