import { useCallback, useEffect, useRef, useState } from 'react'
import { Show, SignInButton, SignUpButton, UserButton, useAuth, useUser } from '@clerk/react'
import type { GameSession } from '@escape-room/shared'
import { ROOM_IDS } from '@escape-room/shared'
import { startOrResumeGame } from './api/game'
import { NameForm } from './account/NameForm'
import { ActivityLog } from './account/ActivityLog'

/**
 * The scaffold page, behind a sign-in gate.
 *
 * Signed out you get the door and nothing else. Signed in, the app makes sure
 * we have a name, then starts or resumes your game — which proves the whole
 * chain: Clerk issues a token, the browser sends it, the API verifies it and
 * finds the game belonging to that account.
 *
 * The rooms replace the panel below. See ADR-0007 for where each sub-team's
 * code goes.
 */
export function App() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-10 px-6 py-16">
      <header className="space-y-3">
        <p className="font-mono text-xs tracking-[0.3em] text-signal-400 uppercase">
          Projektwoche KW 32
        </p>
        <h1 className="font-mono text-4xl font-semibold text-vault-100 sm:text-5xl">
          Der digitale Escape Room
        </h1>
      </header>

      <Show when="signed-out">
        <LockedDoor />
      </Show>

      <Show when="signed-in">
        <SignedIn />
      </Show>
    </main>
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

function SignedIn() {
  const { isLoaded, user } = useUser()
  // Tracked separately from `user.firstName` so the panel advances immediately
  // after saving, without waiting for Clerk to refresh its user object.
  const [nameProvided, setNameProvided] = useState(false)
  const handleSaved = useCallback(() => setNameProvided(true), [])

  if (!isLoaded) {
    return <Panel>Loading your account…</Panel>
  }

  // The name is collected before the game exists, so the name recorded on the
  // game is always the real one.
  if (!nameProvided && !user?.firstName) {
    return <NameForm onSaved={handleSaved} />
  }

  return <GamePanel />
}

function Panel({ children }: { children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-vault-800 bg-vault-900/60 p-5">
      <p className="font-mono text-sm text-vault-100">{children}</p>
    </section>
  )
}

type GameState =
  | { kind: 'loading' }
  | { kind: 'ready'; game: GameSession }
  | { kind: 'error'; message: string }

function GamePanel() {
  const { getToken } = useAuth()
  const [state, setState] = useState<GameState>({ kind: 'loading' })

  // Held in a ref, and the effect runs on mount only.
  //
  // Depending on `getToken` directly would re-run this on every render that
  // hands back a fresh function identity — which is every render — so the app
  // would call the API in a loop for as long as the panel is mounted.
  const getTokenRef = useRef(getToken)
  getTokenRef.current = getToken

  useEffect(() => {
    let cancelled = false

    getTokenRef
      .current()
      .then((token) => startOrResumeGame(token))
      .then((game) => {
        if (!cancelled) setState({ kind: 'ready', game })
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setState({ kind: 'error', message: error instanceof Error ? error.message : 'Unknown' })
        }
      })

    return () => {
      cancelled = true
    }
  }, [])

  return (
    <>
      <section className="flex items-center justify-between rounded-lg border border-vault-800 bg-vault-900/60 p-5">
        <div>
          <h2 className="font-mono text-xs tracking-[0.2em] text-vault-500 uppercase">Your game</h2>
          <p className="mt-2 font-mono text-sm text-vault-100">
            {state.kind === 'loading' && 'Opening your game…'}
            {state.kind === 'ready' &&
              `${state.game.playerName} — ${state.game.solvedRooms.length}/${ROOM_IDS.length} rooms solved`}
            {state.kind === 'error' && `Could not load your game: ${state.message}`}
          </p>
        </div>
        <UserButton />
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

      {state.kind === 'ready' && <ActivityLog events={state.game.events} />}
    </>
  )
}
