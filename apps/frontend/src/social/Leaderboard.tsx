import { useCallback, useEffect, useRef, useState } from 'react'
import type { LeaderboardEntry } from '@escape-room/shared'
import { ROOM_IDS, leaderboardResponseSchema } from '@escape-room/shared'
import { request } from '../api/client'
import { useAppAuth } from '../auth/useAppAuth'
import { Avatar } from './Avatar'

const SCOPES = [
  { id: 'friends', label: 'Friends' },
  { id: 'global', label: 'Everyone' },
] as const

type Scope = (typeof SCOPES)[number]['id']

async function fetchLeaderboard(
  scope: Scope,
  auth: Record<string, string>,
): Promise<LeaderboardEntry[]> {
  const response = await request(`/leaderboard/${scope}`, auth)
  return leaderboardResponseSchema.parse(await response.json()).entries
}

/**
 * How you are getting on — among your friends, or among everybody.
 *
 * Friends is the default view, and that is a decision rather than an accident
 * of ordering: a whole-class ranking is a way to make the slowest person feel
 * bad in public, so the board somebody sees first is the one scoped to people
 * who chose each other. See ADR-0034.
 */
export function Leaderboard({ solvedCount }: { solvedCount: number }) {
  const { authHeaders } = useAppAuth()
  const [scope, setScope] = useState<Scope>('friends')
  const [entries, setEntries] = useState<LeaderboardEntry[] | null>(null)

  const authRef = useRef(authHeaders)
  authRef.current = authHeaders

  const load = useCallback(async (which: Scope) => {
    try {
      setEntries(await fetchLeaderboard(which, await authRef.current()))
    } catch {
      // Left as-is rather than replaced with an error: a board that fails to
      // refresh should keep showing the last one it had.
    }
  }, [])

  // Reloaded when the player's own progress changes, so solving a room moves
  // your row without a refresh — and when the scope changes, because that is a
  // different question entirely.
  useEffect(() => {
    void load(scope)
  }, [load, scope, solvedCount])

  return (
    <section className="pane p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="label">{scope === 'friends' ? 'You and your friends' : 'Everyone playing'}</h2>

        <div role="tablist" aria-label="Who to compare with" className="tabs shrink-0 border-b-0">
          {SCOPES.map((candidate) => (
            <button
              key={candidate.id}
              type="button"
              role="tab"
              aria-selected={candidate.id === scope}
              tabIndex={candidate.id === scope ? 0 : -1}
              onClick={() => {
                // Cleared rather than kept, so the old scope's rows are not
                // shown for a moment under the new scope's heading.
                if (candidate.id !== scope) setEntries(null)
                setScope(candidate.id)
              }}
              className="tab"
            >
              {candidate.label}
            </button>
          ))}
        </div>
      </div>

      {entries === null && <p className="mt-3 text-sm text-stock-600">Loading…</p>}

      {entries !== null && scope === 'friends' && entries.length <= 1 && (
        <p className="mt-3 text-sm text-stock-600">
          Add a friend to see how you compare — or switch to Everyone.
        </p>
      )}

      {entries !== null && scope === 'global' && entries.length === 0 && (
        <p className="mt-3 text-sm text-stock-600">Nobody has started a room yet.</p>
      )}

      {/* One row is a board when it is everybody, and is not when it is only
          you and no friends — hence the different thresholds. */}
      {entries !== null && entries.length > (scope === 'friends' ? 1 : 0) && (
        <ol className="mt-3 space-y-1">
          {entries.map((entry, index) => (
            <li
              key={entry.profile.userId}
              // A break before a row that is not next in sequence — the global
              // board appends your own row when you are outside the top ten, so
              // this is where the jump from 10th to 23rd is made visible rather
              // than left to be misread as a mistake.
              data-gap={index > 0 && entry.rank > (entries[index - 1]?.rank ?? 0) + 1}
              className={`flex items-center gap-3 px-3 py-2 data-[gap=true]:mt-2 data-[gap=true]:border-t data-[gap=true]:border-dashed data-[gap=true]:border-stock-900/30 data-[gap=true]:pt-3 ${
                entry.isMe ? 'bg-stock-200/60' : ''
              }`}
            >
              <span className="w-7 shrink-0 text-right font-mono text-sm tabular-nums text-stock-600">
                {entry.rank}
              </span>
              <Avatar subject={entry.profile} size={32} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-mono text-sm text-stock-900">
                  {entry.profile.displayName}
                  {entry.isMe && <span className="ml-2 text-xs text-stock-600">you</span>}
                </p>
                <p className="truncate font-mono text-xs text-stock-600">
                  {entry.solvedRooms}/{ROOM_IDS.length} rooms
                  {entry.hintsUsed > 0 &&
                    ` · ${entry.hintsUsed} ${entry.hintsUsed === 1 ? 'hint' : 'hints'}`}
                </p>
              </div>
              {entry.finishedInMs !== null && (
                <span className="shrink-0 font-mono text-xs text-solved-600">
                  {formatDuration(entry.finishedInMs)}
                </span>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}

/** `12:05` for anything under an hour, `1:02:05` beyond it. */
function formatDuration(ms: number): string {
  const total = Math.round(ms / 1000)
  const seconds = total % 60
  const minutes = Math.floor(total / 60) % 60
  const hours = Math.floor(total / 3600)

  const pad = (n: number) => String(n).padStart(2, '0')
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`
}
