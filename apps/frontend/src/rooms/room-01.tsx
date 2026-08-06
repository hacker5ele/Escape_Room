import { useState } from 'react'
import type { RoomProps } from './registry'
import { LEVEL_MARKS, LibraryBackdrop, ScrollMark, ShelfColumn } from './room-01-art'

interface Level {
  id: string
  label: string
  kind: string
  prompt: string
  accepted: string[]
  mark: string
}

const KIND_LABELS: Record<string, string> = {
  task: 'Task',
  quiz: 'Quiz',
  riddle: 'Riddle',
}

/** The backend sends `data` as `Record<string, unknown>` — narrow it here, not in the shell. */
function readLevels(data: Record<string, unknown>): Level[] {
  if (!Array.isArray(data.levels)) return []
  return data.levels.filter((entry): entry is Level => {
    const level = entry as Partial<Level>
    return (
      typeof level === 'object' &&
      level !== null &&
      typeof level.id === 'string' &&
      typeof level.label === 'string' &&
      typeof level.kind === 'string' &&
      typeof level.prompt === 'string' &&
      Array.isArray(level.accepted) &&
      level.accepted.every((word) => typeof word === 'string') &&
      typeof level.mark === 'string'
    )
  })
}

/**
 * Room 1 — The Reading Hall.
 *
 * This is the one room that does not stand its player on the shared walkable
 * Stage (see `definition.customScene` in `registry.tsx`, and the note on
 * `RoomView`). The Reading Hall is a dark library scene of its own — shelving
 * down both walls, a light shaft through the collapsed roof, a floor that
 * fades into shadow — built from the same Overprint stock ramp rather than a
 * second palette. `RoomView` still owns entering, hints and the solved
 * celebration; this room owns only its own backdrop and its own puzzle.
 *
 * The puzzle: ten levels — tasks, quizzes, riddles drawn from Greek myth,
 * Homer, Egypt and Rome — one at a time, each revealing the next when
 * answered correctly. That per-level check happens right here in the
 * browser: it is a pacing gate, not a security boundary, the same way the
 * room list's frosted glass (ADR-0032) is cosmetic. The one check that
 * matters — the combined code — goes through `onAnswer`, which is the
 * server.
 */
export function RoomOne({ room, onAnswer, busy }: RoomProps) {
  const levels = readLevels(room.data)
  const [solvedLevels, setSolvedLevels] = useState<ReadonlySet<string>>(new Set())
  const [code, setCode] = useState('')

  const currentIndex = levels.findIndex((level) => !solvedLevels.has(level.id))
  const current = currentIndex === -1 ? null : (levels[currentIndex] ?? null)
  const marks = levels.filter((level) => solvedLevels.has(level.id)).map((level) => level.mark)

  return (
    <div className="room1-scene pointer-events-auto">
      <ShelfColumn className="pointer-events-none absolute inset-y-0 left-0 hidden w-20 text-stock-800 opacity-60 md:block lg:w-28" />
      <ShelfColumn className="pointer-events-none absolute inset-y-0 right-0 hidden w-20 text-stock-800 opacity-60 md:block lg:w-28" />
      <LibraryBackdrop />
      <ScrollMark className="pointer-events-none absolute -bottom-6 -left-10 h-48 w-48 text-stock-800 opacity-40 sm:h-64 sm:w-64" />
      <ScrollMark className="pointer-events-none absolute -right-12 -bottom-10 h-56 w-56 rotate-12 text-stock-800 opacity-30 sm:h-72 sm:w-72" />

      <div className="relative mx-auto flex w-full max-w-[52ch] flex-col gap-4 px-5 pt-28 pb-8 sm:px-8 sm:pt-36">
        <p className="prose text-sm text-stock-200">{room.prompt}</p>

        {marks.length > 0 && (
          <p className="font-mono text-xs text-stock-400">Marks so far: {marks.join(' ')}</p>
        )}

        {current ? (
          <LevelChallenge
            key={current.id}
            level={current}
            index={currentIndex}
            total={levels.length}
            onSolved={() => setSolvedLevels((existing) => new Set(existing).add(current.id))}
          />
        ) : (
          <form
            className="pane space-y-3 p-4"
            onSubmit={(event) => {
              event.preventDefault()
              const trimmed = code.trim()
              if (!trimmed) return
              onAnswer(trimmed)
            }}
          >
            <p className="label">The code</p>
            <p className="prose text-sm text-stock-700">
              All ten marks are yours. Enter the code they spell.
            </p>
            <div className="flex flex-wrap gap-2">
              <input
                value={code}
                onChange={(event) => setCode(event.target.value)}
                aria-label="The code"
                placeholder="Code"
                inputMode="numeric"
                autoComplete="off"
                maxLength={24}
                disabled={busy}
                className="field min-w-0 flex-1"
              />
              <button type="submit" disabled={busy || code.trim().length === 0} className="btn">
                {busy ? 'Checking…' : 'Open the vault'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

/** One level's own local state — keyed by `level.id` in the parent, so it resets clean on advance. */
function LevelChallenge({
  level,
  index,
  total,
  onSolved,
}: {
  level: Level
  index: number
  total: number
  onSolved: () => void
}) {
  const [input, setInput] = useState('')
  const [feedback, setFeedback] = useState<string | null>(null)
  const Mark = LEVEL_MARKS[level.id]

  function handleSubmit(event: { preventDefault: () => void }) {
    event.preventDefault()
    const value = input.trim().toUpperCase()
    if (!value) return

    if (level.accepted.includes(value)) {
      onSolved()
    } else {
      setFeedback('Not quite. Try again.')
    }
  }

  return (
    <form onSubmit={handleSubmit} className="pane space-y-3 p-4">
      <div className="flex items-center gap-3">
        {Mark && <Mark className="h-9 w-9 shrink-0 text-stock-700" />}
        <div>
          <p className="label">
            Level {index + 1} of {total} · {KIND_LABELS[level.kind] ?? level.kind}
          </p>
          <p className="mt-0.5 text-xs text-stock-500">{level.label}</p>
        </div>
      </div>
      <p className="prose text-sm text-stock-800">{level.prompt}</p>
      <div className="flex flex-wrap gap-2">
        <input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          aria-label="Your answer"
          placeholder="Your answer"
          autoComplete="off"
          maxLength={32}
          className="field min-w-0 flex-1"
        />
        <button type="submit" className="btn btn-sm">
          Check
        </button>
      </div>
      {feedback && (
        <p role="alert" className="font-mono text-xs text-signal-600">
          {feedback}
        </p>
      )}
    </form>
  )
}
