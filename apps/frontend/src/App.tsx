import { useCallback, useEffect, useRef, useState } from 'react'
import { Show, SignInButton, SignUpButton, UserButton, useAuth } from '@clerk/react'
import type { GameSession } from '@escape-room/shared'
import { ROOM_IDS } from '@escape-room/shared'
import { ApiRequestError, startOrResumeGame } from './api/game'
import { ProfileForm } from './account/ProfileForm'
import { ActivityLog } from './account/ActivityLog'

/**
 * The scaffold page, behind a sign-in gate.
 *
 * Signed out you get the door and nothing else. Signed in, the app asks the API
 * to open your game — which proves the whole chain: Clerk issues a token, the
 * browser sends it, the API verifies it and finds the game belonging to that
 * account.
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
        <GamePanel />
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

type GameState =
  | { kind: 'loading' }
  | { kind: 'needs-profile' }
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

  const open = useCallback(async () => {
    setState({ kind: 'loading' })
    try {
      const game = await startOrResumeGame(await getTokenRef.current())
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
        <div>
          <h2 className="font-mono text-xs tracking-[0.2em] text-vault-500 uppercase">Your game</h2>
          <p className="mt-2 font-mono text-sm text-vault-100">
            {state.kind === 'loading' && 'Opening your game…'}
            {state.kind === 'ready' &&
              `${state.game.username} — ${state.game.solvedRooms.length}/${ROOM_IDS.length} rooms solved`}
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
