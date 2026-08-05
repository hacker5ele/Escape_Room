import { useState } from 'react'
import type { RoomProps } from '../types'
import { HOTSPOT_MARKS, LibraryBackdrop, ScrollMark, ShelfColumn } from './illustrations'

interface Level {
  id: string
  label: string
  kind: string
  prompt: string
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
      typeof level.mark === 'string'
    )
  })
}

/**
 * Room 1 — The Reading Hall. Ten levels — tasks, quizzes, riddles drawn from
 * Greek myth, Homer, Egypt and Rome — each revealing the next when answered
 * correctly. The per-level check happens right here in the browser: it is a
 * pacing gate, not a security boundary, the same way the room list's frosted
 * glass (ADR-0032) is cosmetic. The one check that matters — the combined
 * code — goes through `onSubmit`, which is the server.
 */
export function Room01({ room, onSubmit, onHint }: RoomProps) {
  const levels = readLevels(room.data)

  const [solvedLevels, setSolvedLevels] = useState<ReadonlySet<string>>(new Set())
  const [levelInputs, setLevelInputs] = useState<Record<string, string>>({})
  const [levelFeedback, setLevelFeedback] = useState<Record<string, string | null>>({})

  const [answer, setAnswer] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [feedback, setFeedback] = useState<string | null>(null)
  const [solved, setSolved] = useState(false)

  const [hints, setHints] = useState<string[]>([])
  const [hintBusy, setHintBusy] = useState(false)

  function submitLevel(level: Level, event: { preventDefault: () => void }) {
    event.preventDefault()
    const value = (levelInputs[level.id] ?? '').trim()
    if (value.length === 0) return

    if (value === level.mark) {
      setSolvedLevels((current) => new Set(current).add(level.id))
      setLevelFeedback((current) => ({
        ...current,
        [level.id]: `Correct — the mark is ${level.mark}.`,
      }))
    } else {
      setLevelFeedback((current) => ({ ...current, [level.id]: 'Not quite. Try again.' }))
    }
  }

  async function handleSubmit(event: { preventDefault: () => void }) {
    event.preventDefault()
    if (submitting || !answer.trim()) return

    setSubmitting(true)
    setFeedback(null)
    try {
      const result = await onSubmit(answer.trim())
      if (result.correct) {
        setSolved(true)
        setFeedback('Correct. The vault unlocks.')
      } else {
        setFeedback(result.feedback ?? 'Not it.')
      }
    } catch (caught) {
      setFeedback(caught instanceof Error ? caught.message : 'Something went wrong.')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleHint() {
    if (hintBusy) return
    setHintBusy(true)
    try {
      const hint = await onHint()
      setHints((current) => [...current, hint])
    } catch (caught) {
      setFeedback(caught instanceof Error ? caught.message : 'Could not fetch a hint.')
    } finally {
      setHintBusy(false)
    }
  }

  return (
    <div className="room1-scene">
      <ShelfColumn className="pointer-events-none absolute inset-y-0 left-0 hidden w-20 text-stock-800 opacity-60 md:block lg:w-28" />
      <ShelfColumn className="pointer-events-none absolute inset-y-0 right-0 hidden w-20 text-stock-800 opacity-60 md:block lg:w-28" />
      <LibraryBackdrop />
      <ScrollMark className="pointer-events-none absolute -bottom-6 -left-10 h-48 w-48 text-stock-800 opacity-40 sm:h-64 sm:w-64" />
      <ScrollMark className="pointer-events-none absolute -right-12 -bottom-10 h-56 w-56 rotate-12 text-stock-800 opacity-30 sm:h-72 sm:w-72" />

      <div className="relative mx-auto flex w-full max-w-3xl flex-col gap-6 px-5 pt-28 pb-10 sm:px-8 sm:pt-36">
        <header>
          <h2 className="font-display text-3xl font-bold tracking-[-0.03em] text-stock-50 sm:text-4xl">
            {room.title}
          </h2>
          <p className="prose mt-3 text-sm text-stock-300">{room.intro}</p>
          <p className="mt-3 text-sm text-stock-200">{room.prompt}</p>
        </header>

        <div className="flex flex-col gap-3">
          {levels.map((level, index) => {
            const previous = levels[index - 1]
            const unlocked = index === 0 || (previous ? solvedLevels.has(previous.id) : true)
            const isSolved = solvedLevels.has(level.id)
            const Mark = HOTSPOT_MARKS[level.id]

            return (
              <section key={level.id} data-testid={`level-${level.id}`} className="pane p-5">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    {Mark && <Mark className="h-8 w-8 shrink-0 text-stock-700" />}
                    <div>
                      <span className="label">
                        Level {index + 1} · {KIND_LABELS[level.kind] ?? level.kind}
                      </span>
                      <p className="mt-0.5 text-xs text-stock-500">{level.label}</p>
                    </div>
                  </div>
                  {isSolved && <span className="text-solved-600 text-sm font-medium">✓</span>}
                </div>

                {!unlocked && (
                  <p className="veil prose mt-3 text-sm text-stock-600" data-unlocked="false">
                    Solve the level above to reveal this one.
                  </p>
                )}

                {unlocked && (
                  <div className="mt-3 space-y-3">
                    <p className="prose text-sm text-stock-800">{level.prompt}</p>

                    {isSolved ? (
                      <p className="font-mono text-sm text-solved-600">{levelFeedback[level.id]}</p>
                    ) : (
                      <>
                        <form
                          onSubmit={(event) => submitLevel(level, event)}
                          className="flex flex-wrap items-end gap-3"
                        >
                          <label className="block">
                            <span className="label">Digit</span>
                            <input
                              value={levelInputs[level.id] ?? ''}
                              onChange={(event) =>
                                setLevelInputs((current) => ({
                                  ...current,
                                  [level.id]: event.target.value,
                                }))
                              }
                              inputMode="numeric"
                              maxLength={4}
                              required
                              className="mt-1 field"
                            />
                          </label>
                          <button type="submit" className="btn btn-sm">
                            Check
                          </button>
                        </form>

                        {levelFeedback[level.id] && (
                          <p role="alert" className="font-mono text-xs text-signal-600">
                            {levelFeedback[level.id]}
                          </p>
                        )}
                      </>
                    )}
                  </div>
                )}
              </section>
            )
          })}
        </div>

        <section className="pane space-y-3 p-5">
          <h3 className="label">The code the marks spell</h3>

          {solved ? (
            <p className="font-mono text-sm text-solved-600">{feedback}</p>
          ) : (
            <form
              onSubmit={(event) => {
                void handleSubmit(event)
              }}
              className="flex flex-wrap items-end gap-3"
            >
              <label className="block">
                <span className="label">Code</span>
                <input
                  value={answer}
                  onChange={(event) => setAnswer(event.target.value)}
                  inputMode="numeric"
                  maxLength={24}
                  required
                  className="mt-1 field"
                />
              </label>
              <button type="submit" disabled={submitting} className="btn">
                {submitting ? 'Checking…' : 'Submit'}
              </button>
              <button
                type="button"
                onClick={() => void handleHint()}
                disabled={hintBusy || hints.length >= room.hintsAvailable}
                className="btn btn-ghost"
              >
                {hints.length >= room.hintsAvailable ? 'No hints left' : 'Hint'}
              </button>
            </form>
          )}

          {!solved && feedback && (
            <p role="alert" className="font-mono text-sm text-signal-600">
              {feedback}
            </p>
          )}

          {hints.length > 0 && (
            <ul className="space-y-1 font-mono text-xs text-stock-600">
              {hints.map((hint, index) => (
                <li key={index}>{hint}</li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}
