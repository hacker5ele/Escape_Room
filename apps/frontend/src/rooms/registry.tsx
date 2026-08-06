import type { LiveRoom, RoomId, RoomPublicData } from '@escape-room/shared'
import { ROOM_IDS } from '@escape-room/shared'
import type { SceneName } from '../stage/scenes'
import type { Actor } from '../stage/Stage'

/**
 * The frontend half of the room plugin registry (ADR-0007).
 *
 * The backend has `domain/rooms/index.ts`; this is its mirror, and the two are
 * kept honest by `ROOM_IDS` in the shared contract, which both import. A room
 * is one entry here and one file beside it, so two sub-teams rarely touch the
 * same code.
 *
 * **This is the seam.** `RoomView` owns everything every room needs — entering,
 * the answer box, hints, the solved celebration, co-op presence — and a room
 * component owns only what makes *that* room itself. Abigail and Eleonora
 * replace the insides of the files below; they should not need to touch
 * anything else in this folder.
 */

export interface RoomProps {
  /** What the server sent on entering. Never contains the answer — see ADR-0006. */
  room: RoomPublicData
  /** Hand an answer to the server. Feedback and the solved state are handled above. */
  onAnswer: (answer: unknown) => void
  /** True while an attempt is in flight; disable inputs on it. */
  busy: boolean
  /**
   * The room's own state, arriving on the heartbeat twice a second.
   *
   * **Null for every room that is a question and a box**, which is most of
   * them. A room only has one of these if the server is running a clock for it
   * (ADR-0048), and what is inside `detail` is that room's own business —
   * narrow it in the room, not here.
   */
  live: LiveRoom | null
  /** Everybody standing in the room, you included, already interpolated. */
  actors: Actor[]
  /**
   * Press E at something.
   *
   * The shell carries it and knows nothing about what a station *is* — that is
   * the room's business. Sent on the next beat, which the shell brings forward
   * so it does not feel late.
   */
  onAct: (stationId: string) => void
  /** Take hold of something, or let go with null. Re-sent every beat until released. */
  onHold: (stationId: string | null) => void
  /** What this player currently has hold of. */
  holding: string | null
}

export interface RoomDefinition {
  id: RoomId
  /** The name on the door. Shown by the lobby's room picker and the room header. */
  title: string
  /** One line of atmosphere for the lobby tile. */
  tagline: string
  /** Which scenery set the stage dresses itself with. Unused when `customScene` is set. */
  scene: SceneName
  /**
   * This room draws its own backdrop instead of standing on the shared
   * walkable Stage — `render` gets the whole scene, not just the chrome on
   * top of it. The trade is real: no co-op walking or emotes in this room.
   * The Reading Hall is the one room that makes it, because its puzzle *is*
   * a place to be scattered through — see the note on `RoomOne`.
   */
  customScene?: boolean
  /**
   * Drawn **inside** the stage's coordinate space and depth-sorted with the
   * players, so a room can put things in the world you walk behind rather than
   * only panels that float over it.
   *
   * Optional, and most rooms will never want it: a room whose furniture stands
   * still should put it in `scenes.ts` instead, where it costs no rendering at
   * all. This is for the ones whose furniture changes while you watch.
   */
  renderWorld?: (props: RoomProps) => React.ReactNode
  render: (props: RoomProps) => React.ReactNode
}

import { HallWorldFor, RoomOne } from './room-01'
import { RoomTwo } from './room-02'
import { RoomFour } from './room-04'

const DEFINITIONS: Record<RoomId, RoomDefinition> = {
  'room-01': {
    id: 'room-01',
    title: 'The Reading Hall',
    tagline: 'Below the harbour, and the harbour has found it.',
    scene: 'hall',
    renderWorld: (props) => <HallWorldFor {...props} />,
    render: (props) => <RoomOne {...props} />,
  },
  'room-02': {
    id: 'room-02',
    title: 'Room Two',
    tagline: 'Locked until the first is solved.',
    scene: 'vault',
    render: (props) => <RoomTwo {...props} />,
  },
  // room-03 ("The Sphinx's Reckoning") never renders through here — it opts
  // out of the shared Stage/RoomView shell entirely and is rendered
  // full-screen by App.tsx's `Room03Route` instead, since it needs a richer
  // RoomProps contract (hints inline, hearts, reset, complete — see
  // ADR-0065) than this registry's onAnswer/busy shape supports. This entry
  // exists only so `Record<RoomId, RoomDefinition>` stays total and
  // `roomDefinition('room-03')` has something to return if it is ever
  // reached — App.tsx's `RoomRoute` intercepts room-03 before RoomView
  // (which is what would otherwise call this) is ever asked to render it.
  'room-03': {
    id: 'room-03',
    title: "The Sphinx's Reckoning",
    tagline: 'Deeper in.',
    scene: 'vault',
    render: () => null,
  },
  'room-04': {
    id: 'room-04',
    title: 'The Lost Archive',
    tagline: 'Ten marks, out of Rome, Greece, Egypt and Troy.',
    scene: 'vault',
    customScene: true,
    render: (props) => <RoomFour {...props} />,
  },
}

export function roomDefinition(roomId: RoomId): RoomDefinition {
  return DEFINITIONS[roomId]
}

export const ROOMS: RoomDefinition[] = ROOM_IDS.map((id) => DEFINITIONS[id])
