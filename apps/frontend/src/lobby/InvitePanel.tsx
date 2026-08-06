import { useCallback, useEffect, useRef, useState } from 'react'
import type { Friend } from '@escape-room/shared'
import { MAX_PARTY_SIZE } from '@escape-room/shared'
import { createInvite, inviteLink, listFriends } from '../api/social'
import { inviteToGame } from '../api/party'
import { useAppAuth } from '../auth/useAppAuth'
import { play } from '../audio/sfx'
import { Avatar } from '../social/Avatar'

/**
 * Getting somebody into your game.
 *
 * Two ways, because they answer different questions. **A friend** is already in
 * your list, so it is one button and they get a notification. **A link** is for
 * somebody who is not — it works before they have an account, shows them who is
 * inviting them, and following it makes you friends *and* puts them in the
 * party in one step rather than two (ADR-0042).
 *
 * Only the host sees this. A guest inviting people into a game that is not
 * theirs to share is refused by the API anyway, so the control is simply not
 * rendered for them.
 */
export function InvitePanel({
  partySize,
  inPartyUserIds,
}: {
  partySize: number
  /** Already here, so they are shown as such rather than offered again. */
  inPartyUserIds: string[]
}) {
  const { authHeaders } = useAppAuth()
  const [friends, setFriends] = useState<Friend[] | null>(null)
  const [invited, setInvited] = useState<Set<string>>(new Set())
  const [link, setLink] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const authRef = useRef(authHeaders)
  authRef.current = authHeaders

  const full = partySize >= MAX_PARTY_SIZE

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const lists = await listFriends(await authRef.current())
        if (!cancelled) setFriends(lists.friends)
      } catch {
        // A friend list that will not load is not worth an error here — the
        // link half of this panel still works without it.
        if (!cancelled) setFriends([])
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const ask = useCallback(async (userId: string) => {
    setError(null)
    try {
      await inviteToGame(await authRef.current(), userId)
      play('chime')
      // Marked locally rather than refetched: the server has no "invited"
      // state to read back, because an invitation is a notification and not a
      // relationship.
      setInvited((current) => new Set(current).add(userId))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not send that invitation.')
    }
  }, [])

  async function makeLink() {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      const invite = await createInvite(await authRef.current(), { forParty: true })
      setLink(inviteLink(invite.token))
      play('pop')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not make a link.')
    } finally {
      setBusy(false)
    }
  }

  function copy() {
    if (!link) return
    // Clipboard access can be refused — an insecure origin, or the player said
    // no. Failing silently would look like the button is broken.
    void navigator.clipboard
      .writeText(link)
      .then(() => {
        setCopied(true)
        play('click')
        window.setTimeout(() => setCopied(false), 2000)
      })
      .catch(() => setError('Could not copy — select the link and copy it by hand.'))
  }

  const available = (friends ?? []).filter(
    (friend) => !inPartyUserIds.includes(friend.profile.userId),
  )

  return (
    <section className="pane p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="label">Invite</h2>
        <span className="text-xs text-stock-500">
          {partySize} / {MAX_PARTY_SIZE}
        </span>
      </div>

      {full ? (
        <p className="prose mt-3 text-xs text-stock-600">
          Your game is full. Somebody has to leave before anybody else can come in.
        </p>
      ) : (
        <>
          {friends === null && <p className="mt-3 text-xs text-stock-500">Loading friends…</p>}

          {friends !== null && available.length === 0 && (
            <p className="prose mt-3 text-xs text-stock-600">
              Everybody you know is already here. Send a link to somebody who is not.
            </p>
          )}

          {available.length > 0 && (
            <ul className="mt-3 space-y-1">
              {available.map((friend) => (
                <li
                  key={friend.profile.userId}
                  className="pane-inset flex items-center gap-2 px-2 py-1.5"
                >
                  <Avatar subject={friend.profile} size={28} />
                  <span className="min-w-0 flex-1 truncate text-sm">
                    {friend.profile.displayName || friend.profile.username}
                  </span>
                  <button
                    type="button"
                    onClick={() => void ask(friend.profile.userId)}
                    disabled={invited.has(friend.profile.userId)}
                    className="btn btn-ghost btn-sm"
                  >
                    {invited.has(friend.profile.userId) ? 'Asked' : 'Invite'}
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-3">
            {link ? (
              <div className="pane-inset flex flex-wrap items-center gap-2 px-2 py-1.5">
                <code className="min-w-0 flex-1 truncate text-xs text-stock-700">{link}</code>
                <button type="button" onClick={copy} className="btn btn-ghost btn-sm">
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => void makeLink()}
                disabled={busy}
                className="btn btn-ghost btn-sm w-full"
              >
                {busy ? 'Making a link…' : 'Make an invite link'}
              </button>
            )}
            <p className="prose mt-2 text-xs text-stock-500">
              Works before they have an account. Following it makes you friends and brings them
              straight in.
            </p>
          </div>
        </>
      )}

      {error && (
        <p role="alert" className="mt-3 text-xs text-signal-600">
          {error}
        </p>
      )}
    </section>
  )
}
