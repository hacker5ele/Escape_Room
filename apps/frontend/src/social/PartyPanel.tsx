import { useCallback, useEffect, useRef, useState } from 'react'
import type { Friend, Party } from '@escape-room/shared'
import { fetchParty, inviteToGame, joinGame, leaveGame, removeFromGame } from '../api/party'
import { useAppAuth } from '../auth/useAppAuth'
import { useSync } from '../sync/useSync'
import { Avatar } from './Avatar'

/**
 * Who you are playing with.
 *
 * Playing alone is a party of one, so there is no separate solo case — the
 * panel simply has no members to list and offers your friends instead.
 */
export function PartyPanel({
  friends,
  onChanged,
}: {
  friends: Friend[]
  /** The game changed underneath us — the page needs to re-read it. */
  onChanged: () => void
}) {
  const { authHeaders } = useAppAuth()
  const { notifications } = useSync()
  const [party, setParty] = useState<Party | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const authRef = useRef(authHeaders)
  authRef.current = authHeaders

  const run = useCallback(
    async (action: (auth: Record<string, string>) => Promise<Party | null>) => {
      setBusy(true)
      setError(null)
      try {
        const next = await action(await authRef.current())
        if (next) setParty(next)
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'Something went wrong.')
      } finally {
        setBusy(false)
      }
    },
    [],
  )

  const reload = useCallback(() => run(async (auth) => fetchParty(auth)), [run])

  useEffect(() => {
    void reload()
  }, [reload])

  // Somebody joining or inviting arrives as a notification, so the shared poll
  // is what makes this panel live without a second timer of its own.
  const newestNotificationId = notifications[0]?.id
  useEffect(() => {
    if (newestNotificationId) void reload()
  }, [newestNotificationId, reload])

  if (party === null) return null

  const invitable = friends.filter(
    (friend) =>
      friend.profile.userId !== party.host.userId &&
      !party.members.some((member) => member.userId === friend.profile.userId),
  )

  return (
    <section className="space-y-4 pane p-5">
      <h2 className="label">
        {party.isHost ? 'Your game' : `${party.host.displayName}’s game`}
      </h2>

      {error && (
        <p role="alert" className="rounded border border-red-900 bg-red-950/40 p-3 text-sm text-red-200">
          {error}
        </p>
      )}

      {!party.isHost && (
        <div className="flex flex-wrap items-center gap-3 pane-inset px-3 py-2">
          <Avatar subject={party.host} size={32} />
          <p className="min-w-0 flex-1 truncate font-mono text-sm text-stock-900">
            You are playing in {party.host.displayName}’s game.
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              void run(async (auth) => {
                const next = await leaveGame(auth)
                onChanged()
                return next
              })
            }
            className="btn btn-ghost btn-sm"
          >
            Leave
          </button>
        </div>
      )}

      {party.members.length > 0 && (
        <ul className="space-y-2">
          {party.members.map((member) => (
            <li
              key={member.userId}
              className="flex flex-wrap items-center gap-3 pane-inset px-3 py-2"
            >
              <Avatar subject={member} size={32} />
              <p className="min-w-0 flex-1 truncate font-mono text-sm text-stock-900">
                {member.displayName} is playing with you
              </p>
              {party.isHost && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void run(async (auth) => removeFromGame(auth, member.userId))}
                  className="btn btn-ghost btn-sm"
                >
                  Remove
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {party.isHost && invitable.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm text-stock-600">
            Invite a friend in, or join theirs instead — you keep your own progress either way.
          </p>
          {invitable.map((friend) => (
            <div
              key={friend.profile.userId}
              className="flex flex-wrap items-center gap-2 pane-inset px-3 py-2"
            >
              <Avatar subject={friend.profile} size={28} />
              <span className="min-w-0 flex-1 truncate font-mono text-sm text-stock-900">
                {friend.profile.displayName}
              </span>
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  void run(async (auth) => {
                    await inviteToGame(auth, friend.profile.userId)
                    return null
                  })
                }
                className="btn btn-ghost btn-sm"
              >
                Invite
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  void run(async (auth) => {
                    const next = await joinGame(auth, friend.profile.userId)
                    onChanged()
                    return next
                  })
                }
                className="rounded bg-signal-500 px-3 py-1.5 font-mono text-xs font-semibold text-stock-50 transition hover:bg-signal-600 disabled:opacity-50"
              >
                Join theirs
              </button>
            </div>
          ))}
        </div>
      )}

      {party.isHost && party.members.length === 0 && invitable.length === 0 && (
        <p className="text-sm text-stock-600">
          Add a friend to play a room together.
        </p>
      )}
    </section>
  )
}
