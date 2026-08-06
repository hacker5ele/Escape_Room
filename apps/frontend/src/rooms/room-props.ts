import type {
  AttemptResponse,
  HintResponse,
  RoomCompleteResponse,
  RoomPublicData,
  RoomResetResponse,
} from '@escape-room/shared'

/**
 * The shape every room component receives. One prop set, whatever the puzzle
 * — see ADR-0007. `answer` is `unknown` because each room's own `check()` on
 * the server is what narrows it; the room component decides what UI produces
 * that value (a number field, a cipher input, a multiple-choice button).
 *
 * `onResetRoom` wipes this room's own progress only (see ADR-0066) — most
 * rooms never call it; it exists for a room like room-03 whose frontend has
 * a sub-mechanic (the Atlantis quest) with no other way to tell the server
 * its own run failed.
 *
 * `onCompleteRoom` marks the room solved with no answer involved (see
 * ADR-0070) — for a room whose final stage(s) are entirely client-side, so
 * there is no `onSubmit` call left to carry a true `roomComplete`. The
 * server still decides whether this is actually allowed right now
 * (`RoomDefinition.canComplete`), so calling it early just fails; most
 * rooms never call it at all.
 *
 * `onRoomFinished` tells the app it is safe to move on to the next room now
 * (see ADR-0069). The app does NOT advance the instant the server marks a
 * room solved — a room may want to show its own on-screen finale first (a
 * congratulations scene, a walk through a door) before handing off. Rooms
 * that finish the moment their last answer is checked can simply call this
 * immediately after a correct final answer; most rooms will want to call it
 * from a "Continue" / "Finish" button instead.
 */
export interface RoomProps {
  room: RoomPublicData
  onSubmit: (answer: unknown) => Promise<AttemptResponse>
  onHint: () => Promise<HintResponse>
  onResetRoom: () => Promise<RoomResetResponse>
  onCompleteRoom: () => Promise<RoomCompleteResponse>
  onRoomFinished: () => void
}
