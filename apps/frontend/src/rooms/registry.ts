import { lazy, type LazyExoticComponent } from 'react'
import type { RoomId } from '@escape-room/shared'
import type { RoomProps } from './types'

type RoomComponent = LazyExoticComponent<(props: RoomProps) => React.ReactElement>

/**
 * Maps a room id to its component, lazily. See ADR-0007 — a room that fails
 * to compile should not take the rest of the app down with it.
 *
 * Partial on purpose: each sub-team adds their own line as their room is
 * built. A room with no entry yet falls back to a "not built" placeholder in
 * `CurrentRoom` rather than failing to compile.
 */
export const ROOM_COMPONENTS: Partial<Record<RoomId, RoomComponent>> = {
  'room-01': lazy(() => import('./room-01/Room01').then((module) => ({ default: module.Room01 }))),
}
