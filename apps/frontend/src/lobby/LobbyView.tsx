import { useCallback, useMemo, useState } from 'react'
import type { GameSession, RoomId } from '@escape-room/shared'
import { ROOM_IDS, isRoomUnlocked } from '@escape-room/shared'
import { useAppAuth } from '../auth/useAppAuth'
import { play, type SoundName } from '../audio/sfx'
import { Stage, type Actor } from '../stage/Stage'
import { useMovement } from '../stage/useMovement'
import { spawnPoint } from '../stage/scenes'
import { EmoteBar } from './EmoteBar'
import { Countdown } from './Countdown'
import { type EmoteName, emoteDuration, emoteSound } from '../character/emotes'
import { roomDefinition } from '../rooms/registry'
import type { Character } from '../character/parts'

/**
 * The waiting room.
 *
 * Fortnite's *structure* — a party standing about, a ready toggle, a room to
 * pick, one big button — because that arrangement is proven and everybody
 * already knows how to read it. None of its look: this is the same two inks on
 * paper as the rest of the app, and the characters standing in it are the same
 * 1950s cartoons the player built at sign-up.
 *
 * There is no "play alone or with a friend" question. Everybody lands here, and
 * a lobby of one is simply a lobby of one — which removes a decision from the
 * fastest path and means the room where friends arrive is the room you were
 * already standing in.
 */
export function LobbyView({
  game,
  character,
  onEnterRoom,
  onLeave,
}: {
  game: GameSession
  character: Character
  onEnterRoom: (roomId: RoomId) => void
  onLeave: () => void
}) {
  const { profile } = useAppAuth()
  const [emote, setEmote] = useState<EmoteName | null>(null)
  const [ready, setReady] = useState(false)
  const [counting, setCounting] = useState(false)

  const { position, walkTo, stopWalking } = useMovement(spawnPoint(0, 1))

  /** The first room you have not finished — the one PLAY means by default. */
  const suggested = useMemo<RoomId>(
    () => ROOM_IDS.find((id) => !game.solvedRooms.includes(id)) ?? ROOM_IDS[0],
    [game.solvedRooms],
  )
  const [selected, setSelected] = useState<RoomId>(suggested)

  const fire = useCallback((name: EmoteName) => {
    setEmote(name)
    play(emoteSound(name) as SoundName)
    window.setTimeout(() => setEmote(null), emoteDuration(name))
  }, [])

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
    isHost: true,
  }

  function start() {
    if (counting) return
    // Re-checked at the moment of starting rather than only when picked: the
    // selection could have been made before a room was solved. The server
    // refuses a locked room anyway (ADR-0006) — this only avoids walking the
    // player into that refusal.
    const target = isRoomUnlocked(game, selected) ? selected : ROOM_IDS[0]
    setSelected(target)
    setCounting(true)
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-4 px-4 py-6 sm:px-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="label">The waiting room</p>
          <h1 className="font-display text-3xl font-bold tracking-[-0.03em] text-stock-900 sm:text-4xl">
            Ready when you are
          </h1>
        </div>
        <button type="button" onClick={onLeave} className="btn btn-ghost btn-sm">
          Back
        </button>
      </header>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,300px)]">
        <div className="flex flex-col gap-3">
          <Stage scene="lobby" actors={[me]} onWalkTo={walkTo} onWalkEnd={stopWalking} />
          <EmoteBar onEmote={fire} disabled={counting} />
          <p className="prose text-xs text-stock-500">
            Arrow keys or WASD to walk — or just drag on the stage.
          </p>
        </div>

        <aside className="flex flex-col gap-4">
          <section className="pane p-4">
            <h2 className="label">Room</h2>
            <div className="mt-3 grid grid-cols-4 gap-2">
              {ROOM_IDS.map((roomId, index) => {
                const unlocked = isRoomUnlocked(game, roomId)
                const done = game.solvedRooms.includes(roomId)
                return (
                  <button
                    key={roomId}
                    type="button"
                    disabled={!unlocked}
                    aria-label={roomDefinition(roomId).title}
                    data-selected={roomId === selected}
                    data-locked={!unlocked ? '' : undefined}
                    onClick={() => {
                      play('click')
                      setSelected(roomId)
                    }}
                    className="room-tile"
                  >
                    <span className={done ? 'text-solved-600' : ''}>{done ? '✓' : index + 1}</span>
                  </button>
                )
              })}
            </div>
            <p className="prose mt-3 text-xs text-stock-600">
              {roomDefinition(selected).title} — {roomDefinition(selected).tagline}
            </p>
          </section>

          <section className="pane p-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="label">Party</h2>
              <span className="text-xs text-stock-500">1 / 4</span>
            </div>
            <ul className="mt-3 space-y-1">
              <li className="pane-inset flex items-center justify-between gap-2 px-3 py-2 text-sm">
                <span className="truncate">
                  <span aria-hidden="true">♛ </span>
                  {profile?.username ?? 'you'}
                </span>
                <span className={ready ? 'text-solved-600' : 'text-stock-500'}>
                  {ready ? 'READY' : '…'}
                </span>
              </li>
            </ul>
          </section>

          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={() => {
                setReady((current) => !current)
                play(ready ? 'click' : 'chime')
              }}
              data-on={ready ? '' : undefined}
              className="btn btn-ghost ready-toggle"
            >
              {ready ? "I'm ready" : 'Ready?'}
            </button>

            <button type="button" onClick={start} disabled={counting} className="btn play-button">
              {counting ? 'Going in…' : 'PLAY ▶'}
            </button>
          </div>
        </aside>
      </div>

      {counting && <Countdown onDone={() => onEnterRoom(selected)} />}
    </main>
  )
}
