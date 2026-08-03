import { Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { Show, SignInButton, SignUpButton, UserButton, useAuth } from '@clerk/react'
import type { AttemptResponse, GameSession, RoomId } from '@escape-room/shared'
import { isRoomUnlocked, ROOM_IDS } from '@escape-room/shared'
import { ApiRequestError, fetchRoom, requestHint, startOrResumeGame, submitAttempt } from './api/game'
import { ProfileForm } from './account/ProfileForm'
import { ActivityLog } from './account/ActivityLog'
import { ROOM_REGISTRY } from './rooms/registry'
import { LOCKS } from './rooms/room-02/story'

/**
 * Temporary local preview: `?preview=room-02` renders a room directly, with a
 * fake session and no network calls, so it can be looked at without a working
 * Clerk/API setup. Remove once the room is wired up through the real flow.
 */
const PREVIEW_ROOM_ID = new URLSearchParams(window.location.search).get('preview') as RoomId | null

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
}

function PreviewRoom({ roomId }: { roomId: RoomId }) {
  const RoomComponent = ROOM_REGISTRY[roomId]
  if (!RoomComponent) {
    return <p className="p-8 font-mono text-sm text-vault-300">No frontend registered for {roomId}.</p>
  }
  return (
    <Suspense fallback={<p className="p-8 font-mono text-sm text-vault-300">Loading room…</p>}>
      <RoomComponent
        room={{}}
        onSubmit={async (answer: unknown) => {
          // No backend in preview mode, so the exit override is checked against
          // the frontend's own answer text instead of the server. Room-02 only,
          // since it's the only lock currently wired to a real API call.
          const normalized = typeof answer === 'string' ? answer.trim().toLowerCase() : ''
          const correct = roomId === 'room-02' && normalized === LOCKS.exit.answer.toLowerCase()
          return {
            correct,
            feedback: correct ? undefined : 'Preview mode — checked locally, no backend involved.',
            session: FAKE_SESSION,
          }
        }}
        onHint={async () => ({ hint: 'Preview mode — no real hints.', hintsUsed: 0, hintsRemaining: 0 })}
      />
    </Suspense>
  )
}

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
  if (PREVIEW_ROOM_ID) {
    return <PreviewRoom roomId={PREVIEW_ROOM_ID} />
  }

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

type RoomViewState =
  | { kind: 'closed' }
  | { kind: 'loading'; roomId: RoomId }
  | { kind: 'ready'; roomId: RoomId; room: import('@escape-room/shared').RoomPublicData }
  | { kind: 'error'; roomId: RoomId; message: string }

function GamePanel() {
  const { getToken } = useAuth()
  const [state, setState] = useState<GameState>({ kind: 'loading' })
  const [roomView, setRoomView] = useState<RoomViewState>({ kind: 'closed' })

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

  const openRoom = useCallback(async (roomId: RoomId) => {
    setRoomView({ kind: 'loading', roomId })
    try {
      const room = await fetchRoom(roomId, await getTokenRef.current())
      setRoomView({ kind: 'ready', roomId, room })
    } catch (error) {
      setRoomView({
        kind: 'error',
        roomId,
        message: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  }, [])

  if (state.kind === 'needs-profile') {
    return <ProfileForm onSaved={() => void open()} />
  }

  if (roomView.kind !== 'closed') {
    const RoomComponent = roomView.kind === 'ready' ? ROOM_REGISTRY[roomView.roomId] : undefined
    return (
      <>
        <button
          type="button"
          onClick={() => setRoomView({ kind: 'closed' })}
          className="fixed top-3 left-3 z-[9999] rounded bg-vault-900/90 px-3 py-1.5 font-mono text-xs text-vault-100 shadow"
        >
          ← Back to rooms
        </button>

        {roomView.kind === 'loading' && <p className="p-8 font-mono text-sm text-vault-300">Opening room…</p>}
        {roomView.kind === 'error' && (
          <p className="p-8 font-mono text-sm text-vault-300">Could not open room: {roomView.message}</p>
        )}
        {roomView.kind === 'ready' && RoomComponent && (
          <Suspense fallback={<p className="p-8 font-mono text-sm text-vault-300">Loading room…</p>}>
            <RoomComponent
              room={roomView.room}
              onSubmit={async (answer: unknown): Promise<AttemptResponse> => {
                const result = await submitAttempt(roomView.roomId, answer, await getTokenRef.current())
                setState((prev) => (prev.kind === 'ready' ? { kind: 'ready', game: result.session } : prev))
                return result
              }}
              onHint={async () => {
                const result = await requestHint(roomView.roomId, await getTokenRef.current())
                setState((prev) =>
                  prev.kind === 'ready'
                    ? { kind: 'ready', game: { ...prev.game, hintsUsed: result.hintsUsed } as GameSession }
                    : prev,
                )
                return result
              }}
            />
          </Suspense>
        )}
        {roomView.kind === 'ready' && !RoomComponent && (
          <p className="p-8 font-mono text-sm text-vault-300">This room doesn&apos;t have a frontend yet.</p>
        )}
      </>
    )
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
            const unlocked = state.kind === 'ready' && isRoomUnlocked(state.game, roomId)
            return (
              <li key={roomId} data-testid={roomId} data-solved={solved}>
                <button
                  type="button"
                  disabled={!unlocked}
                  onClick={() => void openRoom(roomId)}
                  className="flex w-full items-center gap-3 rounded border border-vault-800 px-3 py-2 font-mono text-sm text-vault-300 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <span className={solved ? 'text-solved-400' : 'text-signal-400'}>
                    {solved ? '✓' : index + 1}
                  </span>
                  {roomId}
                </button>
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
