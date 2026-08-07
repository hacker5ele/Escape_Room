import { useMemo } from 'react'
import type { GameEvent } from '@escape-room/shared'
import { CharacterFigure } from '../character/CharacterFigure'
import type { Character } from '../character/parts'
import type { EmoteName } from '../character/emotes'
import { EmoteBar } from '../lobby/EmoteBar'
import type { RemoteActor } from '../stage/usePresence'

/**
 * Who else is in this room, in every room.
 *
 * The game has been multiplayer since ADR-0028 — a guest's solves go to the
 * host's game — but only room 1 ever *showed* you that. In the other four your
 * partner was invisible: same game, same room, two people staring at separate
 * screens with no evidence the other existed.
 *
 * This is the shell's answer, drawn over whatever the room is doing, so no
 * room author has to know it exists. It shows each member of the party as
 * their own character, says what they just did, and lets you emote at them —
 * which is the whole of "being in here together" for a room that has no
 * walkable stage to stand on.
 *
 * **It does not appear when you are alone.** A party of one has nothing to
 * show, and rooms 2 and 4 fill the screen with their own thing; an empty panel
 * sitting on top of them would be a cost with no benefit.
 */
export function PartyRail({
  peers,
  events,
  onEmote,
}: {
  peers: RemoteActor[]
  /** The shared activity log, oldest first — the same one the Activity tab reads. */
  events: readonly GameEvent[]
  onEmote: (emote: EmoteName) => void
}) {
  /**
   * The most recent thing each person did. Walked backwards because the newest
   * entry wins and the log is oldest-first.
   *
   * **An event with no actor is the host's.** `actorFor` in `rooms.routes.ts`
   * deliberately leaves the game's owner off — *"stamping every event with the
   * only possible actor is noise"* — which was true while the owner was the
   * only one who ever read the log. A guest reads it now, and without this the
   * host is the one person in the party whose actions can never be described.
   * Found by running it: two players in a room, and the host had just solved
   * something while the rail said "just arrived".
   */
  const latest = useMemo(() => {
    const byActor = new Map<string, GameEvent>()
    let ownersLatest: GameEvent | undefined
    for (let i = events.length - 1; i >= 0; i -= 1) {
      const event = events[i]
      if (!event) continue
      if (!event.actorUserId) {
        ownersLatest ??= event
        continue
      }
      if (!byActor.has(event.actorUserId)) byActor.set(event.actorUserId, event)
    }
    return { byActor, ownersLatest }
  }, [events])

  if (peers.length === 0) return null

  return (
    <aside className="party-rail" aria-label="Who else is in this room">
      <ul className="party-rail-people">
        {peers.map((peer) => (
          <li key={peer.userId} className="party-rail-person" data-away={peer.away ? '' : undefined}>
            <span className="party-rail-portrait">
              {/* Their live emote plays here. On a stage you would see it over
                  their character; in a room with no stage this is the only
                  place it can land, and it costs nothing — the emote is
                  already on the beat. */}
              <CharacterFigure
                character={peer.character as Character}
                emote={peer.emote}
                walking={false}
                style={{ height: 84 }}
              />
            </span>
            <span className="party-rail-name">{peer.name}</span>
            <span className="party-rail-doing">
              {say(latest.byActor.get(peer.userId) ?? (peer.isHost ? latest.ownersLatest : undefined))}
            </span>
          </li>
        ))}
      </ul>

      <EmoteBar onEmote={onEmote} />
    </aside>
  )
}

/**
 * One line about what somebody just did.
 *
 * Read off the shared activity log rather than sent for this purpose — every
 * one of these has been recorded against the game since ADR-0020, complete
 * with who did it, and nothing new has to travel for the rail to be able to
 * say it.
 */
function say(event: GameEvent | undefined): string {
  if (!event) return 'just arrived'

  const room = event.roomId ? `room ${event.roomId.slice(-2)}` : 'the game'
  switch (event.type) {
    case 'room_solved':
      return `solved ${room}`
    case 'attempt':
      return event.correct ? `got ${room}` : 'tried something'
    case 'hint_taken':
      return `took a hint in ${room}`
    case 'room_entered':
      return `came into ${room}`
    case 'game_completed':
      return 'finished the game'
    case 'game_started':
      return 'started playing'
    default:
      return 'is here'
  }
}
