import { useCallback, useEffect, useRef, useState } from 'react'
import type { GameSession, RoomId, RoomPublicData } from '@escape-room/shared'
import { attemptRoom, enterRoom, takeHint } from '../api/rooms'
import { ApiRequestError } from '../api/client'
import { useAppAuth } from '../auth/useAppAuth'
import { play } from '../audio/sfx'
import { Stage, type Actor } from '../stage/Stage'
import { useMovement } from '../stage/useMovement'
import { usePresence, toActor } from '../stage/usePresence'
import { setPhase, useRegisterStageAuth } from '../api/stage'
import { spawnPoint } from '../stage/scenes'
import { EmoteBar } from '../lobby/EmoteBar'
import { type EmoteName, emoteDuration, emoteSound } from '../character/emotes'
import type { SoundName } from '../audio/sfx'
import { isCharacter, type Character } from '../character/parts'
import { roomDefinition } from './registry'

/**
 * A room, played.
 *
 * Everything a room needs that is not the puzzle lives here — entering, hints,
 * submitting, the solved celebration, walking about, emotes — so a sub-team
 * building room 3 writes only the puzzle (ADR-0007). The registry is the seam.
 *
 * The API this calls has existed and been tested since the scaffold and had
 * never once been called from a browser. That, and nothing else, is why the
 * game was not playable.
 */

type State =
  | { kind: 'loading' }
  | { kind: 'locked'; message: string }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; room: RoomPublicData }

export function RoomView({
  roomId,
  game,
  character,
  onSolved,
  onLeave,
}: {
  roomId: RoomId
  game: GameSession
  character: Character
  onSolved: (session: GameSession) => void
  onLeave: () => void
}) {
  const { authHeaders, profile } = useAppAuth()
  const [state, setState] = useState<State>({ kind: 'loading' })
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState<string | null>(null)
  const [hints, setHints] = useState<string[]>([])
  const [solved, setSolved] = useState(false)
  const [emote, setEmote] = useState<EmoteName | null>(null)

  const definition = roomDefinition(roomId)
  const { position, walkTo, stopWalking, current } = useMovement(spawnPoint(0, 1))
  useRegisterStageAuth()
  const { actors, phase, isHost, sendEmote } = usePresence({
    position: current,
    character,
    ready: false,
  })

  // The host being here is what puts the party here — so a reload straight into
  // a room, or a guest arriving later, finds the party already in it.
  useEffect(() => {
    if (isHost) void setPhase({ kind: 'room', roomId })
  }, [isHost, roomId])

  // A guest follows the host out, or into a different room.
  useEffect(() => {
    if (isHost) return
    if (phase.kind === 'lobby') onLeave()
    else if (phase.roomId !== roomId) onLeave()
  }, [isHost, phase, roomId, onLeave])

  // Held in a ref, and the effect runs on mount only: depending on the function
  // itself would re-enter the room on every render.
  const authRef = useRef(authHeaders)
  authRef.current = authHeaders

  useEffect(() => {
    let cancelled = false

    void (async () => {
      try {
        const room = await enterRoom(roomId, await authRef.current())
        if (cancelled) return
        setState({ kind: 'ready', room })
        play('whoosh')
      } catch (error) {
        if (cancelled) return
        // The 403 gate is the server refusing a locked room (ADR-0006). It is
        // not an error — it is the game working — so it reads differently.
        if (error instanceof ApiRequestError && error.status === 403) {
          setState({ kind: 'locked', message: error.message })
          return
        }
        setState({
          kind: 'error',
          message: error instanceof Error ? error.message : 'Could not open this room.',
        })
      }
    })()

    return () => {
      cancelled = true
    }
  }, [roomId])

  const fire = useCallback(
    (name: EmoteName) => {
      setEmote(name)
      sendEmote(name)
      play(emoteSound(name) as SoundName)
      window.setTimeout(() => setEmote(null), emoteDuration(name))
    },
    [sendEmote],
  )

  async function answer(value: unknown) {
    if (busy || solved) return
    setBusy(true)
    setFeedback(null)

    try {
      const result = await attemptRoom(roomId, value, await authRef.current())
      if (result.correct) {
        setSolved(true)
        play('stamp')
        window.setTimeout(() => play('fanfare'), 180)
        // The character celebrates without being asked, which is the cheapest
        // way to make solving feel like something happened.
        fire('cheer')
        onSolved(result.session)
      } else {
        play('slide')
        setFeedback(result.feedback ?? 'Not that. Try again.')
      }
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Could not check that answer.')
    } finally {
      setBusy(false)
    }
  }

  async function hint() {
    if (busy) return
    setBusy(true)
    try {
      const result = await takeHint(roomId, await authRef.current())
      play('pop')
      setHints((current) => [...current, result.hint])
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'No more hints.')
    } finally {
      setBusy(false)
    }
  }

  const me: Actor = {
    userId: game.userId,
    name: profile?.username ?? 'you',
    character,
    x: position.x,
    y: position.y,
    facing: position.facing,
    walking: position.walking,
    emote,
    isMe: true,
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-4 px-4 py-6 sm:px-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="label">Room {definition.id.slice(-2)}</p>
          <h1 className="font-display text-3xl font-bold tracking-[-0.03em] text-stock-900">
            {state.kind === 'ready' ? state.room.title : definition.title}
          </h1>
        </div>
        <button
          type="button"
          onClick={onLeave}
          className="btn btn-ghost btn-sm"
        >
          Leave the room
        </button>
      </header>

      {state.kind === 'loading' && <p className="pane p-5 text-sm">Opening the door…</p>}

      {state.kind === 'locked' && (
        <section className="pane p-5">
          <h2 className="font-display text-xl font-bold text-stock-900">This door is locked</h2>
          <p className="prose mt-2 text-sm text-stock-600">{state.message}</p>
          <button type="button" onClick={onLeave} className="btn mt-4">
            Back
          </button>
        </section>
      )}

      {state.kind === 'error' && (
        <p role="alert" className="pane p-5 text-sm text-signal-600">
          {state.message}
        </p>
      )}

      {state.kind === 'ready' && (
        <>
          <p className="prose max-w-[62ch] text-sm text-stock-600">{state.room.intro}</p>

          <Stage
            scene={definition.scene}
            actors={[me, ...actors.map(toActor)]}
            onWalkTo={walkTo}
            onWalkEnd={stopWalking}
          >
            {solved ? (
              <div className="pane pointer-events-auto p-4 text-center">
                <p className="font-display text-2xl font-bold text-solved-600">Solved</p>
                <button type="button" onClick={onLeave} className="btn mt-3">
                  Onward
                </button>
              </div>
            ) : (
              definition.render({ room: state.room, onAnswer: (value) => void answer(value), busy })
            )}
          </Stage>

          <EmoteBar onEmote={fire} />

          {feedback && (
            <p role="alert" className="pane p-3 text-sm text-signal-600">
              {feedback}
            </p>
          )}

          <section className="pane p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="label">Hints</h2>
              <button
                type="button"
                onClick={() => void hint()}
                disabled={busy || hints.length >= state.room.hintsAvailable}
                className="btn btn-ghost btn-sm"
              >
                {hints.length >= state.room.hintsAvailable
                  ? 'No hints left'
                  : `Take a hint (${state.room.hintsAvailable - hints.length} left)`}
              </button>
            </div>
            {hints.length > 0 && (
              <ol className="mt-3 space-y-1">
                {hints.map((text) => (
                  <li key={text} className="pane-inset px-3 py-2 text-sm text-stock-700">
                    {text}
                  </li>
                ))}
              </ol>
            )}
          </section>
        </>
      )}
    </main>
  )
}

/** Guards the character before a room is entered, so `RoomView` can require one. */
export function hasCharacter(value: unknown): value is Character {
  return isCharacter(value)
}
