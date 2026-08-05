import { useCallback, useEffect, useRef, useState } from 'react'
import type { LeaderboardEntry } from '@escape-room/shared'
import { ROOM_IDS, leaderboardResponseSchema } from '@escape-room/shared'
import { request } from '../api/client'
import { useAppAuth } from '../auth/useAppAuth'
import { Avatar } from './Avatar'

async function fetchLeaderboard(auth: Record<string, string>): Promise<LeaderboardEntry[]> {
  const response = await request('/leaderboard/friends', auth)
  return leaderboardResponseSchema.parse(await response.json()).entries
}

/**
 * How you and your friends are getting on.
 *
 * Friends only, never the whole class — among people who chose each other a
 * board is a reason to keep playing, and in public it is a way to make the
 * slowest person feel bad.
 */
export function Leaderboard({ solvedCount }: { solvedCount: number }) {
  const { authHeaders } = useAppAuth()
  const [entries, setEntries] = useState<LeaderboardEntry[] | null>(null)

  const authRef = useRef(authHeaders)
  authRef.current = authHeaders

  const load = useCallback(async () => {
    try {
      setEntries(await fetchLeaderboard(await authRef.current()))
    } catch {
      // Left as-is rather than replaced with an error: a board that fails to
      // refresh should keep showing the last one it had.
    }
  }, [])

  // Reloaded when the player's own progress changes, so solving a room moves
  // your row without a refresh.
  useEffect(() => {
    void load()
  }, [load, solvedCount])

  return (
    <section className="pane p-5">
      <h2 className="label">
        You and your friends
      </h2>

      {entries === null && <p className="mt-3 text-sm text-stock-600">Loading…</p>}

      {entries !== null && entries.length <= 1 && (
        <p className="mt-3 text-sm text-stock-600">
          Add a friend to see how you compare.
        </p>
      )}

      {entries !== null && entries.length > 1 && (
        <ol className="mt-3 space-y-1">
          {entries.map((entry, index) => (
            <li
              key={entry.profile.userId}
              className={`flex items-center gap-3 rounded px-3 py-2 ${
                entry.isMe ? 'bg-stock-200/60' : ''
              }`}
            >
              <span className="w-5 shrink-0 text-right font-mono text-sm text-stock-600">
                {index + 1}
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
