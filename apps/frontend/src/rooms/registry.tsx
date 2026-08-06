import type { RoomId, RoomPublicData } from '@escape-room/shared'
import { ROOM_IDS } from '@escape-room/shared'

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
  /** What the server sent. Never contains the answer — see ADR-0006. */
  room: RoomPublicData
  /** Hand an answer to the server. Feedback and the solved state are handled above. */
  onAnswer: (answer: unknown) => void
  /** True while an attempt is in flight; disable inputs on it. */
  busy: boolean
}

export interface RoomDefinition {
  id: RoomId
  /** The name on the door. Shown by the lobby's room picker and the room header. */
  title: string
  /** One line of atmosphere for the lobby tile. */
  tagline: string
  /** Which scenery set the stage dresses itself with. */
  scene: 'vault' | 'lobby'
  render: (props: RoomProps) => React.ReactNode
}

import { RoomOne } from './room-01'
import { RoomTwo } from './room-02'
import { RoomFour } from './room-04'

const DEFINITIONS: Record<RoomId, RoomDefinition> = {
  'room-01': {
    id: 'room-01',
    title: 'The Waiting Room',
    tagline: 'Nothing here yet. Walk about.',
    scene: 'vault',
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
  // ADR-0047) than this registry's onAnswer/busy shape supports. This entry
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
    title: 'Room Four',
    tagline: 'The last door.',
    scene: 'vault',
    render: (props) => <RoomFour {...props} />,
  },
}

export function roomDefinition(roomId: RoomId): RoomDefinition {
  return DEFINITIONS[roomId]
}

export const ROOMS: RoomDefinition[] = ROOM_IDS.map((id) => DEFINITIONS[id])
