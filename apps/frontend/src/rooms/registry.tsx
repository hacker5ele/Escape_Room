import type { AttemptResponse, RoomId, RoomPublicData } from '@escape-room/shared'
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

/**
 * What a `customScene` room's `render` actually receives — see `RoomDefinition`.
 * `onAnswer` resolves with the real result rather than firing and forgetting,
 * so a room that needs to react to *why* an attempt failed, or wants to run
 * its own animation on success, can. Every `customScene` room gets this one
 * shape, whether or not it uses the resolved value, rather than one
 * signature per room.
 */
export interface CustomSceneProps extends Omit<RoomProps, 'onAnswer'> {
  onAnswer: (answer: unknown) => Promise<AttemptResponse>
}

export interface RoomDefinition {
  id: RoomId
  /** The name on the door. Shown by the lobby's room picker and the room header. */
  title: string
  /** One line of atmosphere for the lobby tile. */
  tagline: string
  /** Which scenery set the stage dresses itself with. Unused when `customScene` is set. */
  scene: 'vault' | 'lobby'
  /**
   * This room draws its own backdrop instead of standing on the shared
   * walkable Stage — `render` gets `CustomSceneProps`, not just the chrome on
   * top of a scene. The trade is real: no co-op walking or emotes in this
   * room. See ADR-0046 (Room 1) for the shape of that trade.
   */
  customScene?: boolean
  /**
   * Only meaningful alongside `customScene`. This room shows its own ending
   * on a correct answer, so `RoomView` never swaps it out for the generic
   * "Solved" pane the way it does for every other room. Global progress —
   * `solvedRooms`, the next door unlocking — still updates the moment the
   * server says correct; only the *display* of having solved it is the
   * room's own to draw.
   */
  ownsEnding?: boolean
  render: (props: RoomProps) => React.ReactNode
}

import { RoomOne } from './room-01'
import { RoomTwo } from './room-02'
import { RoomThree } from './room-03'
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
    title: 'Genesis Protocol',
    tagline: 'Something got out when the power failed.',
    scene: 'vault',
    customScene: true,
    ownsEnding: true,
    // `RoomTwo` (./room-02.tsx) expects `CustomSceneProps` — safe because
    // `RoomView` only ever calls `render` with that wider shape when
    // `customScene` is set, which it is, right above.
    render: (props) => <RoomTwo {...(props as CustomSceneProps)} />,
  },
  'room-03': {
    id: 'room-03',
    title: 'Room Three',
    tagline: 'Deeper in.',
    scene: 'vault',
    render: (props) => <RoomThree {...props} />,
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
