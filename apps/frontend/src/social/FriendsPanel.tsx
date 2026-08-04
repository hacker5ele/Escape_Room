import { useCallback, useEffect, useRef, useState } from 'react'
import type { Friend, FriendListResponse, Invite } from '@escape-room/shared'
import {
  acceptFriend,
  addFriendByUsername,
  blockUser,
  createInvite,
  inviteLink,
  listFriends,
  listInvites,
  removeFriend,
  revokeInvite,
} from '../api/social'
import { useAppAuth } from '../auth/useAppAuth'
import { Avatar } from './Avatar'

const EMPTY: FriendListResponse = { friends: [], incoming: [], outgoing: [] }

/**
 * Friends, requests and invite links in one place.
 *
 * Every mutating call returns the whole updated list, so the panel replaces its
 * state from the response rather than patching it optimistically. That costs a
 * little payload and buys never showing a friendship the server disagrees with.
 */
export function FriendsPanel() {
  const { authHeaders } = useAppAuth()
  const [lists, setLists] = useState<FriendListResponse>(EMPTY)
  const [invites, setInvites] = useState<Invite[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // Same reason as GamePanel: `authHeaders` is a fresh function on every
  // render, so depending on it directly would re-fetch in a loop.
  const authRef = useRef(authHeaders)
  authRef.current = authHeaders

  /** Wraps a call so every button reports failure the same way. */
  const run = useCallback(async (action: (auth: Record<string, string>) => Promise<void>) => {
    setBusy(true)
    setError(null)
    try {
      await action(await authRef.current())
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Something went wrong.')
    } finally {
      setBusy(false)
    }
  }, [])

  const reload = useCallback(async () => {
    await run(async (auth) => {
      const [friendLists, ownInvites] = await Promise.all([listFriends(auth), listInvites(auth)])
      setLists(friendLists)
      setInvites(ownInvites)
    })
  }, [run])

  useEffect(() => {
    void reload()
  }, [reload])

  return (
    <section className="space-y-5 rounded-lg border border-vault-800 bg-vault-900/60 p-5">
      <h2 className="font-mono text-xs tracking-[0.2em] text-vault-500 uppercase">Friends</h2>

      {error && (
        <p role="alert" className="rounded border border-red-900 bg-red-950/40 p-3 text-sm text-red-200">
          {error}
        </p>
      )}

      <AddFriend
        disabled={busy}
        onAdd={(username) =>
          run(async (auth) => {
            setLists(await addFriendByUsername(auth, username))
          })
        }
      />

      {lists.incoming.length > 0 && (
        <Group title={`Wants to be your friend (${lists.incoming.length})`}>
          {lists.incoming.map((friend) => (
            <Row key={friend.profile.userId} friend={friend}>
              <Action
                label="Accept"
                primary
                disabled={busy}
                onClick={() =>
                  run(async (auth) => setLists(await acceptFriend(auth, friend.profile.userId)))
                }
              />
              <Action
                label="Reject"
                disabled={busy}
                onClick={() =>
                  run(async (auth) => setLists(await removeFriend(auth, friend.profile.userId)))
                }
              />
              <Action
                label="Block"
                disabled={busy}
                onClick={() =>
                  run(async (auth) => setLists(await blockUser(auth, friend.profile.userId)))
                }
              />
            </Row>
          ))}
        </Group>
      )}

      <Group title={`Your friends (${lists.friends.length})`}>
        {lists.friends.length === 0 ? (
          <Empty>Nobody yet. Add someone by username, or send them a link.</Empty>
        ) : (
          lists.friends.map((friend) => (
            <Row key={friend.profile.userId} friend={friend}>
              <Action
                label="Remove"
                disabled={busy}
                onClick={() =>
                  run(async (auth) => setLists(await removeFriend(auth, friend.profile.userId)))
                }
              />
            </Row>
          ))
        )}
      </Group>

      {lists.outgoing.length > 0 && (
        <Group title={`Waiting on them (${lists.outgoing.length})`}>
          {lists.outgoing.map((friend) => (
            <Row key={friend.profile.userId} friend={friend}>
              <Action
                label="Cancel"
                disabled={busy}
                onClick={() =>
                  run(async (auth) => setLists(await removeFriend(auth, friend.profile.userId)))
                }
              />
            </Row>
          ))}
        </Group>
      )}

      <InviteLinks
        invites={invites}
        disabled={busy}
        onCreate={() =>
          run(async (auth) => {
            const invite = await createInvite(auth)
            setInvites((current) => [invite, ...current])
          })
        }
        onRevoke={(token) =>
          run(async (auth) => {
            await revokeInvite(auth, token)
            setInvites((current) => current.filter((invite) => invite.token !== token))
          })
        }
      />
    </section>
  )
}

function AddFriend({
  onAdd,
  disabled,
}: {
  onAdd: (username: string) => void | Promise<void>
  disabled: boolean
}) {
  const [username, setUsername] = useState('')

  return (
    <form
      className="flex gap-2"
      onSubmit={(event) => {
        event.preventDefault()
        const trimmed = username.trim()
        if (!trimmed) return
        setUsername('')
        void onAdd(trimmed)
      }}
    >
      <input
        value={username}
        onChange={(event) => setUsername(event.target.value)}
        placeholder="Their username"
        aria-label="Their username"
        autoComplete="off"
        maxLength={64}
        className="min-w-0 flex-1 rounded border border-vault-700 bg-vault-950 px-3 py-2 font-mono text-sm text-vault-100 placeholder:text-vault-600"
      />
      <button
        type="submit"
        disabled={disabled}
        className="rounded bg-signal-400 px-4 py-2 font-mono text-sm font-semibold text-vault-950 transition hover:bg-signal-300 disabled:opacity-50"
      >
        Add
      </button>
    </form>
  )
}

function InviteLinks({
  invites,
  onCreate,
  onRevoke,
  disabled,
}: {
  invites: Invite[]
  onCreate: () => void | Promise<void>
  onRevoke: (token: string) => void | Promise<void>
  disabled: boolean
}) {
  const [copied, setCopied] = useState<string | null>(null)

  return (
    <Group title="Invite links">
      <p className="text-sm text-vault-500">
        Send one of these to somebody who does not have an account yet. They see who invited them
        before deciding.
      </p>

      {invites.map((invite) => (
        <div
          key={invite.token}
          className="flex flex-wrap items-center gap-2 rounded border border-vault-800 px-3 py-2"
        >
          <code className="min-w-0 flex-1 truncate font-mono text-xs text-vault-300">
            {inviteLink(invite.token)}
          </code>
          <span className="font-mono text-xs text-vault-600">
            {invite.useCount === 1 ? '1 join' : `${invite.useCount} joins`}
          </span>
          <Action
            label={copied === invite.token ? 'Copied' : 'Copy'}
            onClick={() => {
              // Clipboard access can be refused (insecure origin, or the user
              // said no). Failing silently would look like the button is broken.
              void navigator.clipboard
                .writeText(inviteLink(invite.token))
                .then(() => setCopied(invite.token))
                .catch(() => setCopied(null))
            }}
          />
          <Action label="Revoke" disabled={disabled} onClick={() => void onRevoke(invite.token)} />
        </div>
      ))}

      <Action label="Create a link" disabled={disabled} onClick={() => void onCreate()} />
    </Group>
  )
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <h3 className="font-mono text-xs tracking-[0.2em] text-vault-500 uppercase">{title}</h3>
      {children}
    </div>
  )
}

function Row({ friend, children }: { friend: Friend; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded border border-vault-800 px-3 py-2">
      <Avatar subject={friend.profile} size={36} />
      <div className="min-w-0 flex-1">
        <p className="truncate font-mono text-sm text-vault-100">{friend.profile.displayName}</p>
        <p className="truncate font-mono text-xs text-vault-500">@{friend.profile.username}</p>
      </div>
      {children}
    </div>
  )
}

function Action({
  label,
  onClick,
  disabled = false,
  primary = false,
}: {
  label: string
  onClick: () => void
  disabled?: boolean
  primary?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={
        primary
          ? 'rounded bg-signal-400 px-3 py-1.5 font-mono text-xs font-semibold text-vault-950 transition hover:bg-signal-300 disabled:opacity-50'
          : 'rounded border border-vault-700 px-3 py-1.5 font-mono text-xs text-vault-300 transition hover:border-vault-500 disabled:opacity-50'
      }
    >
      {label}
    </button>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-vault-500">{children}</p>
}
