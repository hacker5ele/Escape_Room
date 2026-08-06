import { useState } from 'react'
import type { RoomProps } from './registry'

/**
 * Room 04 — a stub, and the seam a sub-team builds on (ADR-0007).
 *
 * Everything around this component already works: entering the room, the 403
 * gate, hints, submitting an answer, the solved celebration and co-op presence.
 * What is missing is only the puzzle itself.
 *
 * To build this room, replace what is below. `room.data` is whatever the
 * matching backend file put in `getPublicPayload()`, so the two are designed
 * together; `onAnswer` takes any shape the backend's `check()` expects. The
 * answer is never here — the server is the only place that knows it (ADR-0006).
 */
export function RoomFour({ room, onAnswer, busy }: RoomProps) {
  const [answer, setAnswer] = useState('')

  return (
    <form
      className="pane pointer-events-auto w-full max-w-[46ch] p-4"
      onSubmit={(event) => {
        event.preventDefault()
        const trimmed = answer.trim()
        if (!trimmed) return
        onAnswer(trimmed)
      }}
    >
      <p className="prose text-sm text-stock-700">{room.prompt}</p>

      {/* The placeholder rooms send nothing in `data`. A real one renders it
          here — a cipher, a keypad, a set of dials. */}
      {Object.keys(room.data).length > 0 && (
        <pre className="mt-3 overflow-x-auto border border-stock-900/30 bg-stock-50/60 p-2 text-xs">
          {JSON.stringify(room.data, null, 2)}
        </pre>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <input
          value={answer}
          onChange={(event) => setAnswer(event.target.value)}
          aria-label="Your answer"
          placeholder="Your answer"
          autoComplete="off"
          maxLength={200}
          disabled={busy}
          className="field min-w-0 flex-1"
        />
        <button type="submit" disabled={busy || answer.trim().length === 0} className="btn">
          {busy ? 'Checking…' : 'Try it'}
        </button>
      </div>
    </form>
  )
}
