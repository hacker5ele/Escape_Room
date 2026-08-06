import { useState } from 'react'
import type { RoomProps } from './registry'

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
 * Room 1 — The Reading Hall. Ten levels — tasks, quizzes, riddles drawn from
 * Greek myth, Homer, Egypt and Rome — one at a time, each revealing the next
 * when answered correctly. That per-level check happens right here in the
 * browser: it is a pacing gate, not a security boundary, the same way the
 * room list's frosted glass (ADR-0032) is cosmetic. Hints, the solved
 * celebration and the one check that matters — the combined code — are all
 * `RoomView`'s job; this component only ever calls `onAnswer` with the code.
 */
export function RoomOne({ room, onAnswer, busy }: RoomProps) {
  const levels = readLevels(room.data)
  const [solvedLevels, setSolvedLevels] = useState<ReadonlySet<string>>(new Set())
  const [code, setCode] = useState('')

  const currentIndex = levels.findIndex((level) => !solvedLevels.has(level.id))
  const current = currentIndex === -1 ? null : (levels[currentIndex] ?? null)
  const marks = levels.filter((level) => solvedLevels.has(level.id)).map((level) => level.mark)

  return (
    <div className="pane pointer-events-auto w-full max-w-[46ch] p-4">
      <p className="prose text-sm text-stock-700">{room.prompt}</p>

      {marks.length > 0 && (
        <p className="mt-2 font-mono text-xs text-stock-500">Marks so far: {marks.join(' ')}</p>
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
          className="mt-3 space-y-2"
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
    <form onSubmit={handleSubmit} className="mt-3 space-y-2">
      <p className="label">
        Level {index + 1} of {total} · {KIND_LABELS[level.kind] ?? level.kind}
      </p>
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
