import type { HintResponse } from '@escape-room/shared'
import type { CustomSceneProps } from './registry'
import { Room02 } from './room-02/Room02'

/**
 * Bridges the shared `CustomSceneProps` (`registry.tsx`) to the shape
 * `Room02` (`./room-02/Room02.tsx`) was actually built against — a
 * promise-returning `onSubmit` plus a separate `onHint` — from before this
 * room was wired into the shared registry. `Room02` itself is untouched;
 * only this adapter is new. It does not use hints, so `onHint` is a stub
 * that is never actually called.
 */
export function RoomTwo({ room, onAnswer }: CustomSceneProps) {
  return (
    <Room02
      room={room}
      onSubmit={onAnswer}
      onHint={async (): Promise<HintResponse> => ({ hint: '', hintsUsed: 0, hintsRemaining: 0 })}
    />
  )
}
