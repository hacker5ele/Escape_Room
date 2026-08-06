import { Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { SignInButton, SignUpButton, UserButton } from '@clerk/react'
import type { GameSession, RoomId } from '@escape-room/shared'
import { ROOM_IDS } from '@escape-room/shared'
import { ApiRequestError, startOrResumeGame } from './api/game'
import { ProfileForm } from './account/ProfileForm'
import { ActivityLog } from './account/ActivityLog'
import { Avatar } from './social/Avatar'
import { FriendsPanel } from './social/FriendsPanel'
import { Leaderboard } from './social/Leaderboard'
import { InvitePage } from './social/InvitePage'
import { inviteTokenFromPath } from './routing'
import { NotificationBell } from './sync/NotificationBell'
import { LocalSignIn } from './auth/LocalSignIn'
import { useAppAuth } from './auth/useAppAuth'
import { ROOM_REGISTRY } from './rooms/registry'

const PREVIEW_ROOM_ID = new URLSearchParams(window.location.search).get('preview') as RoomId | null

const PREVIEW_DOOR_SOLUTION = 108

const FAKE_SESSION: GameSession = {
  id: '00000000-0000-0000-0000-000000000000',
  userId: 'preview-user',
  username: 'preview',
  playerName: 'Preview',
  solvedRooms: [],
  startedAt: new Date().toISOString(),
  finishedAt: null,
  hintsUsed: 0,
  events: [],
  version: 0,
}

function PreviewRoom({ roomId }: { roomId: RoomId }) {
  const RoomComponent = ROOM_REGISTRY[roomId]
  if (!RoomComponent) {
    return <p className="p-8 font-mono text-sm text-vault-300">No frontend registered for {roomId}.</p>
  }
  return (
    <Suspense fallback={<p className="p-8 font-mono text-sm text-vault-300">Loading room…</p>}>
      <RoomComponent
        room={{
          id: roomId,
          order: 4,
          title: 'The Door',
          intro: 'The last door.',
          prompt: 'The lock wants a number.',
          data: { digits: [4, 8, 15, 16, 23, 42] },
          hintsAvailable: 3,
        }}
        onSubmit={async (answer: unknown) => {
          const correct = Number(answer) === PREVIEW_DOOR_SOLUTION
          return { correct, feedback: correct ? undefined : 'Preview mode — checked locally, no backend involved.', session: FAKE_SESSION }
        }}
        onHint={async () => ({ hint: 'Preview mode — no real hints.', hintsUsed: 0, hintsRemaining: 0 })}
      />
    </Suspense>
  )
}

export function App() {
  const { isLoaded, isSignedIn, mode } = useAppAuth()

  if (PREVIEW_ROOM_ID) {
    return <PreviewRoom roomId={PREVIEW_ROOM_ID} />
  }

  // Read after the hook, never before it, so the hook order cannot change.
  const inviteToken = inviteTokenFromPath(window.location.pathname)
  if (inviteToken) return <InvitePage token={inviteToken} />

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-10 px-6 py-16">
      <header className="space-y-3">
        <h1 className="font-mono text-4xl font-semibold text-vault-100 sm:text-5xl">
          Der digitale Escape Room
        </h1>
      </header>

      {!isLoaded && <Panel>Loading…</Panel>}
      {isLoaded && !isSignedIn && (mode === 'local' ? <LocalSignIn /> : <LockedDoor />)}
      {isLoaded && isSignedIn && <GamePanel />}
    </main>
  )
}

function Panel({ children }: { children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-vault-800 bg-vault-900/60 p-5">
      <p className="font-mono text-sm text-vault-100">{children}</p>
    </section>
  )
}

function LockedDoor() {
  return (
    <section className="rounded-lg border border-vault-800 bg-vault-900/60 p-6">
      <h2 className="font-mono text-sm text-vault-100">The door is locked</h2>
      <p className="mt-2 text-sm text-vault-300">
        Create an account to enter. Your progress is saved to it, so you can leave a room
        half-solved and come back to it.
      </p>

      <div className="mt-5 flex flex-wrap gap-3">
        <SignUpButton mode="modal">
          <button
            type="button"
            className="rounded bg-signal-400 px-4 py-2 font-mono text-sm font-semibold text-vault-950 transition hover:bg-signal-300"
          >
            Register
          </button>
        </SignUpButton>

        <SignInButton mode="modal">
          <button
            type="button"
            className="rounded border border-vault-700 px-4 py-2 font-mono text-sm text-vault-100 transition hover:border-vault-500"
          >
            I already have an account
          </button>
        </SignInButton>
      </div>
    </section>
  )
}

type GameState =
  | { kind: 'loading' }
  | { kind: 'needs-profile' }
  | { kind: 'ready'; game: GameSession }
  | { kind: 'error'; message: string }

function GamePanel() {
  const { authHeaders, mode, signOut, profile } = useAppAuth()
  const [state, setState] = useState<GameState>({ kind: 'loading' })

  // Held in a ref, and the effect runs on mount only.
  //
  // Depending on `authHeaders` directly would re-run this on every render that
  // hands back a fresh function identity — which is every render — so the app
  // would call the API in a loop for as long as the panel is mounted.
  const authHeadersRef = useRef(authHeaders)
  authHeadersRef.current = authHeaders

  const open = useCallback(async () => {
    setState({ kind: 'loading' })
    try {
      const game = await startOrResumeGame(await authHeadersRef.current())
      setState({ kind: 'ready', game })
    } catch (error) {
      // Whether a profile is complete is the server's call, not the browser's.
      // Reading it from the response means the UI cannot disagree with the API
      // about who is allowed to start a game.
      if (error instanceof ApiRequestError && error.needsProfile) {
        setState({ kind: 'needs-profile' })
        return
      }
      setState({
        kind: 'error',
        message: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  }, [])

  useEffect(() => {
    void open()
  }, [open])

  if (state.kind === 'needs-profile') {
    return <ProfileForm onSaved={() => void open()} />
  }

  return (
    <>
      <section className="flex items-center justify-between rounded-lg border border-vault-800 bg-vault-900/60 p-5">
        <div className="flex items-center gap-4">
          {/* Only where Clerk's UserButton is not rendering a face already.
              With it, the same picture appeared twice in one header — once
              here and once as the account menu on the right. */}
          {state.kind === 'ready' && mode !== 'clerk' && (
            <Avatar
              size={44}
              subject={{
                userId: state.game.userId,
                username: state.game.username,
                displayName: state.game.playerName,
                imageUrl: profile?.imageUrl ?? null,
              }}
            />
          )}
          <div>
            <h2 className="font-mono text-xs tracking-[0.2em] text-vault-500 uppercase">
              Your game
            </h2>
            <p className="mt-2 font-mono text-sm text-vault-100">
              {state.kind === 'loading' && 'Opening your game…'}
              {state.kind === 'ready' &&
                `${state.game.username} — ${state.game.solvedRooms.length}/${ROOM_IDS.length} rooms solved`}
              {state.kind === 'error' && `Could not load your game: ${state.message}`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <NotificationBell />
          {mode === 'clerk' ? (
            <UserButton />
          ) : (
            <button
              type="button"
              onClick={signOut}
              className="rounded border border-vault-700 px-3 py-1.5 font-mono text-xs text-vault-300 transition hover:border-vault-500"
            >
              Sign out
            </button>
          )}
        </div>
      </section>

      <section className="rounded-lg border border-vault-800 bg-vault-900/60 p-5">
        <h2 className="font-mono text-xs tracking-[0.2em] text-vault-500 uppercase">Rooms</h2>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {ROOM_IDS.map((roomId, index) => {
            const solved = state.kind === 'ready' && state.game.solvedRooms.includes(roomId)
            return (
              <li
                key={roomId}
                data-testid={roomId}
                data-solved={solved}
                className="flex items-center gap-3 rounded border border-vault-800 px-3 py-2 font-mono text-sm text-vault-300"
              >
                <span className={solved ? 'text-solved-400' : 'text-signal-400'}>
                  {solved ? '✓' : index + 1}
                </span>
                {roomId}
              </li>
            )
          })}
        </ul>
        <p className="mt-4 text-sm text-vault-500">
          The rooms themselves are the team&apos;s work — this panel only proves the account and the
          API agree about whose game this is.
        </p>
      </section>

      {state.kind === 'ready' && <Leaderboard solvedCount={state.game.solvedRooms.length} />}

      {state.kind === 'ready' && <FriendsPanel meUserId={state.game.userId} onGameChanged={() => void open()} />}

      {state.kind === 'ready' && <ActivityLog events={state.game.events} />}
    </>
  )
}
