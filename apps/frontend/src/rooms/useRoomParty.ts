import { useEffect, useRef } from 'react'
import type { GameSession, RoomId } from '@escape-room/shared'
import { startOrResumeGame } from '../api/game'
import { leaveStage, setPhase, useRegisterStageAuth } from '../api/stage'
import { useAppAuth } from '../auth/useAppAuth'
import type { Character } from '../character/parts'
import type { EmoteName } from '../character/emotes'
import { emoteDuration, emoteSound } from '../character/emotes'
import { play, type SoundName } from '../audio/sfx'
import { spawnPoint } from '../stage/scenes'
import { usePresence } from '../stage/usePresence'
import type { Position } from '../stage/useMovement'
import { useEvent } from '../ui/useEvent'

/**
 * Everything a room needs to be somewhere two people can be at once.
 *
 * There are two room shells in this app — `RoomView`, which four rooms play
 * through, and `Room03Route` in `App.tsx`, which room 3 has to its own because
 * it wants a richer contract than the registry offers (ADR-0065). This is the
 * part neither of them should be writing twice:
 *
 * - **the beat**, which is what puts you in the room for everybody else;
 * - **the phase**, which is what takes the party with you. Room 3 was not
 *   doing this at all, so a host walking into it left their partner standing
 *   in the lobby;
 * - **following the host** back out, or into somewhere else;
 * - **the version watch** — the one integer that makes shared progress live
 *   (ADR-0073). It has been shared since ADR-0028; it was just never visible
 *   until somebody made a request of their own.
 *
 * A room with no walkable stage still beats a position. It is meaningless
 * there and costs nothing — the server clamps it, nobody draws it, and having
 * one shape of beat rather than two is worth more than the bytes.
 */
export function useRoomParty({
  roomId,
  character,
  position,
  onGameChange,
  onLeave,
}: {
  roomId: RoomId
  character: Character
  /** Where this player is, for rooms that have somewhere to be. */
  position?: React.RefObject<Position>
  onGameChange: (game: GameSession) => void
  onLeave: () => void
}) {
  const { authHeaders } = useAppAuth()
  const authRef = useRef(authHeaders)
  authRef.current = authHeaders

  useRegisterStageAuth()

  // A room without a stage still has to send *something*. Held in a ref that
  // never changes, so the beat below is built once rather than on every render.
  const still = useRef<Position>({ ...spawnPoint(0, 1), facing: 1, walking: false })
  const where = position ?? still

  const party = usePresence({ position: where, character, ready: false })
  const { actors, phase, isHost, version, sendEmote } = party

  const leave = useEvent(onLeave)
  const pushGame = useEvent(onGameChange)

  // Your character leaves the room the moment you walk out of it rather than
  // standing there until the timeout notices — the one departure that is a
  // real click rather than a guess about an unloading page (ADR-0045).
  useEffect(() => () => void leaveStage(), [])

  // The host being here is what puts the party here, so a reload straight into
  // a room, or a guest arriving later, finds the party already in it.
  useEffect(() => {
    if (isHost) void setPhase({ kind: 'room', roomId })
  }, [isHost, roomId])

  // And a guest goes wherever the party went.
  useEffect(() => {
    if (isHost) return
    if (phase.kind === 'lobby') leave()
    else if (phase.roomId !== roomId) leave()
  }, [isHost, phase, roomId, leave])

  /**
   * The party's progress, kept live.
   *
   * `POST /api/sessions` is the re-read: idempotent, returns the game, so no
   * endpoint had to be invented. Seeded with the version already on screen, so
   * arriving does not fire a fetch for news you are looking at.
   */
  const seen = useRef(version)
  useEffect(() => {
    if (version === seen.current) return
    seen.current = version

    let stale = false
    void (async () => {
      try {
        const fresh = await startOrResumeGame(await authRef.current())
        if (!stale) pushGame(fresh)
      } catch {
        // A screen briefly behind, not a broken room. The next thing anybody
        // does brings the game along with it anyway.
      }
    })()
    return () => {
      stale = true
    }
  }, [version, pushGame])

  /** Emote, shown here at once and on everybody else's screen next beat. */
  const fire = useEvent((name: EmoteName) => {
    sendEmote(name)
    play(emoteSound(name) as SoundName)
    window.setTimeout(() => undefined, emoteDuration(name))
  })

  return { ...party, actors, fire }
}
