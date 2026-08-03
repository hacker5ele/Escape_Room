import type { AttemptResponse, HintResponse, RoomPublicData } from '@escape-room/shared'

/**
 * The props every room component receives, whatever its own puzzle looks
 * like. See ADR-0007 — this is the one contract every room folder implements
 * so the shell never needs to know a room's internals.
 */
export interface RoomProps {
  room: RoomPublicData
  onSubmit: (answer: unknown) => Promise<AttemptResponse>
  onHint: () => Promise<HintResponse>
}
