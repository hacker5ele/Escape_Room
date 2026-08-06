import { Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { Show, SignInButton, SignUpButton, UserButton, useAuth } from '@clerk/react'
import type { GameSession, RoomPublicData } from '@escape-room/shared'
import { currentRoomId, ROOM_IDS } from '@escape-room/shared'
import {
  ApiRequestError,
  completeRoom,
  fetchRoom,
  requestHint,
  resetRoom,
  startOrResumeGame,
  submitAttempt,
} from './api/game'
import { ProfileForm } from './account/ProfileForm'
import { ActivityLog } from './account/ActivityLog'
import { ROOM_COMPONENTS } from './rooms/registry'
import { previewRoomIdFromLocation, RoomPreview } from './rooms/preview'

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
  const previewRoomId = previewRoomIdFromLocation()
  if (previewRoomId) {
    return <RoomPreview roomId={previewRoomId} />
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

      {state.kind === 'ready' && <CurrentRoom game={state.game} onGameChange={(game) => setState({ kind: 'ready', game })} />}

      {state.kind === 'ready' && <ActivityLog events={state.game.events} />}
    </>
  )
}

type RoomState =
  | { kind: 'loading' }
  | { kind: 'ready'; room: RoomPublicData }
  | { kind: 'error'; message: string }

/**
 * Resolves which room the player is currently in from their own progress —
 * the same rule the server enforces — fetches its data, and renders the
 * matching component from the registry. Rooms without a component yet show
 * a placeholder instead of crashing the app.
 */
function CurrentRoom({
  game,
  onGameChange,
}: {
  game: GameSession
  onGameChange: (game: GameSession) => void
}) {
  const { getToken } = useAuth()
  const getTokenRef = useRef(getToken)
  getTokenRef.current = getToken

  const serverRoomId = currentRoomId(game)

  // The room actually on screen can lag behind `serverRoomId` on purpose:
  // the server may already consider the current room solved (its last
  // attempt marked roomComplete, see ADR-0025) while the room's own
  // component is still showing an on-screen finale (a congratulations
  // scene, a walk through a door) that hasn't finished yet. Advancing here
  // is `displayedRoomId` catching up to `serverRoomId`, gated on the room
  // component itself calling `onRoomFinished` — see ADR-0026. Most rooms
  // will call it immediately after their one correct answer, which makes
  // them advance exactly as before; only a room with its own finale
  // sequence needs to hold onto the door for a while first.
  const [displayedRoomId, setDisplayedRoomId] = useState(serverRoomId)
  const [state, setState] = useState<RoomState>({ kind: 'loading' })

  useEffect(() => {
    if (!displayedRoomId) return
    let cancelled = false
    setState({ kind: 'loading' })

    getTokenRef
      .current()
      .then((token) => fetchRoom(token, displayedRoomId))
      .then((room) => {
        if (!cancelled) setState({ kind: 'ready', room })
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setState({
            kind: 'error',
            message: error instanceof Error ? error.message : 'Could not load this room.',
          })
        }
      })

    return () => {
      cancelled = true
    }
  }, [displayedRoomId])

  const roomId = displayedRoomId

  if (!roomId) {
    return (
      <section className="rounded-lg border border-solved-800 bg-vault-900/60 p-6">
        <h2 className="font-mono text-sm text-solved-400">Every room is solved.</h2>
      </section>
    )
  }

  if (state.kind === 'loading') {
    return (
      <section className="rounded-lg border border-vault-800 bg-vault-900/60 p-6">
        <p className="font-mono text-sm text-vault-300">Opening {roomId}…</p>
      </section>
    )
  }

  if (state.kind === 'error') {
    return (
      <section className="rounded-lg border border-alarm-800 bg-vault-900/60 p-6">
        <p className="font-mono text-sm text-alarm-400">Could not load this room: {state.message}</p>
      </section>
    )
  }

  const RoomComponent = ROOM_COMPONENTS[roomId]
  if (!RoomComponent) {
    return (
      <section className="rounded-lg border border-vault-800 bg-vault-900/60 p-6">
        <h2 className="font-mono text-sm text-vault-100">{state.room.title}</h2>
        <p className="mt-2 text-sm text-vault-400">This room has no frontend yet.</p>
      </section>
    )
  }

  return (
    <Suspense
      fallback={
        <section className="rounded-lg border border-vault-800 bg-vault-900/60 p-6">
          <p className="font-mono text-sm text-vault-300">Loading room…</p>
        </section>
      }
    >
      <RoomComponent
        room={state.room}
        onSubmit={async (answer) => {
          const result = await submitAttempt(await getTokenRef.current(), roomId, answer)
          onGameChange(result.session)

          // Deliberately does NOT advance `displayedRoomId` here, even if
          // this attempt just solved the room server-side — see
          // ADR-0026. The room being solved and the player being ready to
          // leave it are different moments; only onRoomFinished (below)
          // moves the displayed room forward. `state.room` may now be
          // stale (this room's own publicData() has moved on, e.g. to its
          // next internal riddle) — re-fetch it so the room keeps showing
          // real content instead of the pre-attempt snapshot, regardless of
          // whether the room is now marked complete.
          const refreshed = await fetchRoom(await getTokenRef.current(), roomId)
          setState({ kind: 'ready', room: refreshed })
          return result
        }}
        onHint={async () => {
          const hintResponse = await requestHint(await getTokenRef.current(), roomId)
          onGameChange({ ...game, hintsUsed: hintResponse.hintsUsed })
          return hintResponse
        }}
        onResetRoom={async () => {
          const result = await resetRoom(await getTokenRef.current(), roomId)
          onGameChange(result.session)
          const refreshed = await fetchRoom(await getTokenRef.current(), roomId)
          setState({ kind: 'ready', room: refreshed })
          return result
        }}
        onCompleteRoom={async () => {
          const result = await completeRoom(await getTokenRef.current(), roomId)
          onGameChange(result.session)
          return result
        }}
        onRoomFinished={() => {
          // The room itself says its on-screen finale is done — now it's
          // safe to catch `displayedRoomId` up to whatever the server
          // already thinks is current.
          setDisplayedRoomId(currentRoomId(game))
        }}
      />
    </Suspense>
  )
}
