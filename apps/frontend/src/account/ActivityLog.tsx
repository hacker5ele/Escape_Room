import type { GameEvent } from '@escape-room/shared'

/**
 * The player's own history, newest first.
 *
 * Reads straight off the game record — the log lives on the same item as the
 * progress, so showing it costs no extra request.
 */
export function ActivityLog({ events }: { events: GameEvent[] }) {
  if (events.length === 0) {
    return null
  }

  const newestFirst = [...events].reverse()

  return (
    <section className="pane p-5">
      <h2 className="label">
        Your activity ({events.length})
      </h2>

      <ol className="mt-3 max-h-64 space-y-1 overflow-y-auto font-mono text-xs">
        {newestFirst.map((event, index) => (
          <li
            key={`${event.at}-${index}`}
            className="flex items-baseline gap-3 border-b border-stock-900/30/60 py-1 last:border-0"
          >
            <time dateTime={event.at} className="shrink-0 text-stock-600">
              {formatTime(event.at)}
            </time>
            <span className={toneFor(event)}>{describe(event)}</span>
          </li>
        ))}
      </ol>
    </section>
  )
}

function formatTime(iso: string): string {
  const date = new Date(iso)
  return Number.isNaN(date.getTime())
    ? '--:--:--'
    : date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function toneFor(event: GameEvent): string {
  if (event.type === 'room_solved' || event.type === 'game_completed') return 'text-solved-600'
  if (event.type === 'attempt' && event.correct === false) return 'text-stock-700'
  if (event.type === 'hint_taken') return 'text-signal-600'
  return 'text-stock-900'
}

function describe(event: GameEvent): string {
  switch (event.type) {
    case 'game_started':
      return 'Started the game'
    case 'room_entered':
      return `Entered ${event.roomId}`
    case 'attempt':
      // The answer is the player's own, so showing it back is safe — and it is
      // what makes the log useful for seeing where you went wrong.
      return event.correct
        ? `Solved ${event.roomId} with "${event.answer ?? ''}"`
        : `Tried "${event.answer ?? ''}" in ${event.roomId}`
    case 'hint_taken':
      return `Took a hint in ${event.roomId}`
    case 'room_solved':
      return `${event.roomId} unlocked the next door`
    case 'game_completed':
      return 'Escaped'
    default:
      return event.type
  }
}
