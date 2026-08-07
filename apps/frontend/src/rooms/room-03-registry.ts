import { lazy, type LazyExoticComponent, type ComponentType } from 'react'
import type { RoomId } from '@escape-room/shared'
import type { RoomProps } from './room-props'

/**
 * Maps each room id to its component, lazily. A room that fails to compile
 * does not take down the rest of the app in development. See ADR-0007.
 *
 * Only room-03 exists today; the other three still need their frontend
 * folder built by their owning sub-team.
 */
export const ROOM_COMPONENTS: Partial<Record<RoomId, LazyExoticComponent<ComponentType<RoomProps>>>> = {
  'room-03': lazy(() => import('./room-03').then((module) => ({ default: module.Room03 }))),
}
