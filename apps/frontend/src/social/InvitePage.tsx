import { useCallback, useEffect, useRef, useState } from 'react'
import { SignInButton, SignUpButton } from '@clerk/react'
import type { PublicProfile } from '@escape-room/shared'
import { ApiRequestError } from '../api/client'
import { acceptInvite, previewInvite } from '../api/social'
import { useAppAuth } from '../auth/useAppAuth'
import { LocalSignIn } from '../auth/LocalSignIn'
import { Avatar } from './Avatar'

/** Set when the link came from a lobby: they want you to play, now. */
type PartyPreview = { size: number; full: boolean } | null

type State =
  | { kind: 'loading' }
  | { kind: 'invalid'; message: string }
  | { kind: 'ready'; inviter: PublicProfile; party: PartyPreview }
  | { kind: 'accepted'; inviter: PublicProfile; party: PartyPreview }

/**
 * What somebody sees when they open an invite link.
 *
 * The preview is fetched *before* asking them to sign in, because that is the
 * entire point of a link: you see who is inviting you, then decide whether to
 * make an account. Asking first would be a registration wall with a friend's
 * name behind it.
 */
export function InvitePage({ token }: { token: string }) {
  const { isLoaded, isSignedIn, authHeaders, mode } = useAppAuth()
  const [state, setState] = useState<State>({ kind: 'loading' })
  const [busy, setBusy] = useState(false)

  const authRef = useRef(authHeaders)
  authRef.current = authHeaders

  useEffect(() => {
    let cancelled = false

    previewInvite(token)
      .then((preview) => {
        if (!cancelled) setState({ kind: 'ready', inviter: preview.inviter, party: preview.party })
      })
      .catch((error: unknown) => {
        if (cancelled) return
        // Unknown, revoked and expired are one error by design, so there is one
        // message for all three.
        const message =
          error instanceof ApiRequestError && error.inviteInvalid
            ? 'This invite link is no longer valid. Ask for a new one.'
            : 'Could not load this invite. Try again in a moment.'
        setState({ kind: 'invalid', message })
      })

    return () => {
      cancelled = true
    }
  }, [token])

  const accept = useCallback(async () => {
    setBusy(true)
    try {
      await acceptInvite(await authRef.current(), token)
      setState((current) =>
        current.kind === 'ready'
          ? { kind: 'accepted', inviter: current.inviter, party: current.party }
          : current,
      )
    } catch (error) {
      setState({
        kind: 'invalid',
        message: error instanceof Error ? error.message : 'Could not accept this invite.',
      })
    } finally {
      setBusy(false)
    }
  }, [token])

  return (
    <Shell>
      {state.kind === 'loading' && <p className="font-mono text-sm text-stock-700">Loading…</p>}

      {state.kind === 'invalid' && (
        <>
          <h2 className="font-mono text-sm text-stock-900">That link does not work</h2>
          <p className="mt-2 text-sm text-stock-700">{state.message}</p>
          <a
            href="/"
            className="mt-5 inline-block btn btn-ghost"
          >
            Go to the escape room
          </a>
        </>
      )}

      {state.kind === 'accepted' && (
        <>
          <Inviter profile={state.inviter} party={state.party} />
          <p className="mt-4 text-sm text-stock-700">
            Done — {state.inviter.displayName} has been asked to confirm. You will see them in your
            friend list once they do.
          </p>
          <a
            href="/"
            className="mt-5 inline-block btn"
          >
            Go to the escape room
          </a>
        </>
      )}

      {state.kind === 'ready' && (
        <>
          <Inviter profile={state.inviter} party={state.party} />

          {!isLoaded && <p className="mt-5 font-mono text-sm text-stock-700">Loading…</p>}

          {isLoaded && isSignedIn && (
            <div className="mt-5 flex flex-wrap gap-3">
              <button
                type="button"
                disabled={busy}
                onClick={() => void accept()}
                className="btn"
              >
                {state.party && !state.party.full ? 'Join their game' : 'Accept'}
              </button>
              <a
                href="/"
                className="btn btn-ghost"
              >
                No thanks
              </a>
            </div>
          )}

          {/* Signed out: the account comes after the decision, not before. */}
          {isLoaded && !isSignedIn && mode === 'local' && (
            <div className="mt-5">
              <LocalSignIn />
            </div>
          )}

          {isLoaded && !isSignedIn && mode === 'clerk' && (
            <div className="mt-5 flex flex-wrap gap-3">
              <SignUpButton mode="modal">
                <button
                  type="button"
                  className="btn"
                >
                  Create an account to accept
                </button>
              </SignUpButton>
              <SignInButton mode="modal">
                <button
                  type="button"
                  className="btn btn-ghost"
                >
                  I already have one
                </button>
              </SignInButton>
            </div>
          )}
        </>
      )}
    </Shell>
  )
}

function Inviter({ profile, party }: { profile: PublicProfile; party: PartyPreview }) {
  return (
    <div className="flex items-center gap-4">
      <Avatar subject={profile} size={64} />
      <div className="min-w-0">
        <p className="font-mono text-lg text-stock-900">{profile.displayName}</p>
        <p className="font-mono text-sm text-stock-600">@{profile.username}</p>
        {/* A party link asks a different question from a friend link, so it
            gets a different sentence — and a different button below. */}
        <p className="mt-1 text-sm text-stock-700">
          {party
            ? party.full
              ? 'wants you to play — but their game is full right now.'
              : `wants you to play. ${party.size} already in.`
            : 'wants to be your friend.'}
        </p>
      </div>
    </div>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-lg flex-col gap-8 px-5 py-10 sm:px-6 sm:py-16">
      <header className="space-y-3">
        <p className="font-mono text-xs tracking-[0.3em] text-signal-600 uppercase">Invitation</p>
        <h1 className="font-mono text-3xl font-semibold text-stock-900">Der digitale Escape Room</h1>
      </header>
      <section className="pane p-6">{children}</section>
    </main>
  )
}
