import { Suspense, useCallback, useEffect, useRef, useState } from 'react'
import type { GameSession, RoomId, RoomPublicData } from '@escape-room/shared'
import { getRoom, requestHint, submitAttempt } from '../api/rooms'
import { useAppAuth } from '../auth/useAppAuth'
import { ROOM_COMPONENTS } from './registry'

type LoadState =
  { kind: 'loading' } | { kind: 'ready'; room: RoomPublicData } | { kind: 'error'; message: string }

/**
 * Fetches the player's current room and mounts its component from the
 * registry. This is the shell every room shares; a room itself only ever
 * sees the `RoomProps` it is handed.
 */
export function CurrentRoom({
  roomId,
  onGameChanged,
  onExit,
}: {
  roomId: RoomId
  /** A correct attempt changes `solvedRooms`, which unlocks the next room. */
  onGameChanged: (game: GameSession) => void
  /** Back to the tabbed page, whether the player is leaving or just solved it. */
  onExit: () => void
}) {
  const { authHeaders } = useAppAuth()
  const [state, setState] = useState<LoadState>({ kind: 'loading' })

  // Same pattern as GamePanel/FriendsPanel: a stable ref so the effect below
  // does not re-run on every render just because `authHeaders` is a fresh
  // function identity each time.
  const authRef = useRef(authHeaders)
  authRef.current = authHeaders

  const load = useCallback(async () => {
    setState({ kind: 'loading' })
    try {
      const { room } = await getRoom(await authRef.current(), roomId)
      setState({ kind: 'ready', room })
    } catch (caught) {
      setState({
        kind: 'error',
        message: caught instanceof Error ? caught.message : 'Could not load this room.',
      })
    }
  }, [roomId])

  useEffect(() => {
    void load()
  }, [load])

  const Component = state.kind === 'ready' ? ROOM_COMPONENTS[roomId] : undefined

  return (
    <div className="fixed inset-0 z-40 overflow-y-auto bg-stock-950">
      <button type="button" onClick={onExit} className="btn btn-sm fixed top-4 right-4 z-50">
        Exit
      </button>

      {state.kind === 'loading' && (
        <section className="pane m-5 p-5">
          <p className="font-mono text-sm text-stock-900">Opening the room…</p>
        </section>
      )}

      {state.kind === 'error' && (
        <section className="pane m-5 p-5">
          <p role="alert" className="font-mono text-sm text-signal-600">
            Could not load this room: {state.message}
          </p>
        </section>
      )}

      {state.kind === 'ready' && !Component && (
        <section className="pane m-5 p-5">
          <h2 className="label">{state.room.title}</h2>
          <p className="prose mt-2 text-sm text-stock-700">
            This room is unlocked, but its owning team has not built it yet.
          </p>
        </section>
      )}

      {state.kind === 'ready' && Component && (
        <Suspense
          fallback={
            <section className="pane m-5 p-5">
              <p className="font-mono text-sm text-stock-900">Loading…</p>
            </section>
          }
        >
          <Component
            room={state.room}
            onSubmit={async (answer) => {
              const result = await submitAttempt(await authRef.current(), roomId, answer)
              onGameChanged(result.session)
              return result
            }}
            onHint={async () => {
              const result = await requestHint(await authRef.current(), roomId)
              return result.hint
            }}
          />
        </Suspense>
      )}
    </div>
  )
}
