import type { RoomProps } from './registry'

/**
 * Room 01 — deliberately empty.
 *
 * There is no puzzle here on purpose. This room exists so co-op presence can be
 * tested: two people walk into it, see each other move, wave, dance, and prove
 * the whole chain works before any actual puzzle depends on it.
 *
 * Everything visible in this room comes from `Stage`, which `RoomView` renders
 * behind this component. That is why there is so little here.
 */
export function RoomOne(_props: RoomProps) {
  return (
    <div className="pane pointer-events-auto max-w-[42ch] p-4">
      <p className="prose text-sm text-stock-700">
        Nothing to solve in here yet — that is the point. Walk around, try the emotes, and see
        whether your friend moves when you do.
      </p>
    </div>
  )
}
