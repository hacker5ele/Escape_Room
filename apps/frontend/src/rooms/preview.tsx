import { Suspense, useState } from 'react'
import type { RoomId, RoomPublicData } from '@escape-room/shared'
import { isRoomId } from '@escape-room/shared'
import { ROOM_COMPONENTS } from './registry'

/**
 * Dev-only preview mode: `?preview=room-03` renders that room directly, with
 * mock data and no network calls, bypassing the sign-in gate and the
 * server's unlock check entirely.
 *
 * This never touches the real unlock rule (ADR-0006) — it is a frontend-only
 * shortcut for looking at a room's UI while building it, not a way to play
 * ahead. `onSubmit` reports what the mock data says is correct; it proves
 * nothing about the real `check()`, which only ever runs on the server. The
 * riddle text/choices/order here must be kept in sync with room-03.ts by
 * hand — there is no build-time check tying them together.
 */
interface MockRiddle {
  riddleNumber: number
  riddleCount: number
  riddleTitle: string
  riddleText: string
  choices: { letter: string; text: string }[]
  correctLetter: string
  hint: string
}

const ROOM_03_RIDDLES: readonly MockRiddle[] = [
  {
    riddleNumber: 1,
    riddleCount: 5,
    riddleTitle: 'The Oldest Written Riddle',
    riddleText: 'There is a house. One enters it blind and comes out seeing. What is it?',
    choices: [
      { letter: 'A', text: 'A school' },
      { letter: 'B', text: 'A temple' },
      { letter: 'C', text: 'A tomb' },
      { letter: 'D', text: 'A womb' },
    ],
    correctLetter: 'A',
    hint: '"Blind" and "seeing" are not about the eyes here.',
  },
  {
    riddleNumber: 2,
    riddleCount: 5,
    riddleTitle: "Plato's Riddle",
    riddleText:
      'A man who is not a man, seeing and not seeing, threw and did not throw a rock that was not a rock, at a bird that was not a bird, perched on a branch that was not a branch. What kind of person was he, and what did he strike at?',
    choices: [
      { letter: 'A', text: 'A blind beggar, throwing a clay shard at a crow' },
      { letter: 'B', text: 'A sleeping soldier, dreaming he threw his shield at an owl' },
      { letter: 'C', text: 'A eunuch with poor eyesight, throwing a pumice stone at a bat perched on a reed' },
      { letter: 'D', text: 'A child, throwing a snowball at a sparrow on a fence' },
    ],
    correctLetter: 'C',
    hint: 'Each "not" describes something real that only resembles the ordinary word used for it.',
  },
  {
    riddleNumber: 3,
    riddleCount: 5,
    riddleTitle: "Homer's Riddle",
    riddleText:
      'Fishermen were asked what they had caught. They answered: "What we caught, we left behind; what we did not catch, we carry with us." What did they carry?',
    choices: [
      { letter: 'A', text: 'Their empty nets' },
      { letter: 'B', text: 'The smell of the sea' },
      { letter: 'C', text: 'Debts owed to the harbor' },
      { letter: 'D', text: 'Lice, picked from their clothes' },
    ],
    correctLetter: 'D',
    hint: 'They were not fishing when this was asked.',
  },
  {
    riddleNumber: 4,
    riddleCount: 5,
    riddleTitle: 'The Riddle of the Bookworm',
    riddleText:
      'A moth ate words. To me that seemed a strange fate, that the worm should swallow the speech of a man — a thief in the darkness, feeding on a sentence glorious and strong. Yet the thieving guest was no wiser for the words it had swallowed. What is the moth, and what is truly being said about it?',
    choices: [
      { letter: 'A', text: 'It is a real moth, and the poem laments a ruined manuscript' },
      { letter: 'B', text: 'It is a metaphor for a lazy student who reads without studying' },
      { letter: 'C', text: 'It is a scribe, and the riddle mocks careless copying of old poems' },
      { letter: 'D', text: 'It is a bookworm eating a page, and devouring words grants it no understanding of them' },
    ],
    correctLetter: 'D',
    hint: 'Take "ate words" literally.',
  },
  {
    riddleNumber: 5,
    riddleCount: 5,
    riddleTitle: 'The Riddle of the Sphinx',
    riddleText: 'What walks on four legs in the morning, on two legs at noon, and on three legs in the evening?',
    choices: [
      { letter: 'A', text: 'A dog that is trained to beg' },
      { letter: 'B', text: 'A human being, across one lifetime' },
      { letter: 'C', text: 'A table that loses a leg with age' },
      { letter: 'D', text: 'A crab, across the tides of one day' },
    ],
    correctLetter: 'B',
    hint: 'Morning, noon, and evening are not one day here.',
  },
]

const MOCK_ROOM_META: Partial<Record<RoomId, Pick<RoomPublicData, 'id' | 'order' | 'title' | 'intro' | 'prompt'>>> = {
  'room-03': {
    id: 'room-03',
    order: 3,
    title: "The Sphinx's Reckoning",
    intro: 'You wake beneath the sand, in a chamber sealed for four thousand years. Stone eyes watch you.',
    prompt: 'The Sphinx asks five things, one at a time. Answer wrong, and it asks again from the beginning.',
  },
}

export function previewRoomIdFromLocation(): RoomId | null {
  const value = new URLSearchParams(window.location.search).get('preview')
  return value && isRoomId(value) ? value : null
}

export function RoomPreview({ roomId }: { roomId: RoomId }) {
  const meta = MOCK_ROOM_META[roomId]
  const RoomComponent = ROOM_COMPONENTS[roomId]
  const [stage, setStage] = useState(0)
  const [hearts, setHearts] = useState(3)

  if (!meta || !RoomComponent) {
    return (
      <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-6 px-6 py-16">
        <p className="font-mono text-sm text-alarm-400">No preview available for {roomId}.</p>
      </main>
    )
  }

  const riddle = ROOM_03_RIDDLES[stage] ?? ROOM_03_RIDDLES[0]
  if (!riddle) {
    return (
      <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-6 px-6 py-16">
        <p className="font-mono text-sm text-alarm-400">No mock riddles configured for {roomId}.</p>
      </main>
    )
  }

  const room: RoomPublicData = {
    ...meta,
    data: {
      act: 'sphinx',
      riddleNumber: riddle.riddleNumber,
      riddleCount: riddle.riddleCount,
      riddleTitle: riddle.riddleTitle,
      riddleText: riddle.riddleText,
      choices: riddle.choices,
      hearts,
      maxHearts: 3,
    },
    hintsAvailable: 5,
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-6 px-6 py-16">
      <p className="font-mono text-xs tracking-[0.2em] text-signal-400 uppercase">
        Preview — {roomId} (mock data, nothing is saved)
      </p>
      <Suspense fallback={<p className="font-mono text-sm text-vault-300">Loading room…</p>}>
        <RoomComponent
          room={room}
          onSubmit={(answer) => {
            const correct = String(answer).toUpperCase() === riddle.correctLetter
            if (correct) {
              setStage((s) => Math.min(ROOM_03_RIDDLES.length - 1, s + 1))
            } else {
              const nextHearts = hearts <= 1 ? 3 : hearts - 1
              setHearts(nextHearts)
              if (nextHearts === 3) setStage(0)
            }
            return Promise.resolve({
              correct,
              feedback: correct ? 'Correct (preview only — nothing was saved).' : 'Wrong.',
              session: {
                id: 'preview',
                userId: 'preview',
                username: 'preview',
                playerName: 'Preview',
                solvedRooms: [],
                startedAt: new Date().toISOString(),
                finishedAt: null,
                hintsUsed: 0,
                events: [],
              },
            })
          }}
          onHint={() => Promise.resolve({ hint: riddle.hint, hintsUsed: 1, hintsRemaining: 4 })}
          onResetRoom={() => {
            setStage(0)
            setHearts(3)
            return Promise.resolve({
              session: {
                id: 'preview',
                userId: 'preview',
                username: 'preview',
                playerName: 'Preview',
                solvedRooms: [],
                startedAt: new Date().toISOString(),
                finishedAt: null,
                hintsUsed: 0,
                events: [],
              },
            })
          }}
          onCompleteRoom={() =>
            Promise.resolve({
              session: {
                id: 'preview',
                userId: 'preview',
                username: 'preview',
                playerName: 'Preview',
                solvedRooms: [],
                startedAt: new Date().toISOString(),
                finishedAt: null,
                hintsUsed: 0,
                events: [],
              },
            })
          }
          onRoomFinished={() => {}}
        />
      </Suspense>
    </main>
  )
}
