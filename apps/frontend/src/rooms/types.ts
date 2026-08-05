import type { AttemptResponse, RoomPublicData } from '@escape-room/shared'

/**
 * The props every room component receives — the same shape for all of them.
 * See ADR-0007. A room narrows `onSubmit`'s answer itself; the shell has no
 * opinion on whether a puzzle wants a word, a number or something else.
 */
export interface RoomProps {
  room: RoomPublicData
  onSubmit: (answer: unknown) => Promise<AttemptResponse>
  onHint: () => Promise<string>
}
