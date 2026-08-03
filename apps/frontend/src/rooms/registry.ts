import { lazy, type ComponentType } from 'react'
import type { RoomId } from '@escape-room/shared'
import type { RoomProps } from './types'

/**
 * Maps a room id to its component, lazily. See ADR-0007 — adding a room here
 * is the one line each sub-team adds; everything else lives in that room's own
 * folder.
 *
 * Deliberately partial: a room id with no entry yet just has no frontend built,
 * which is the normal state of an in-progress registry, not an error.
 */
export const ROOM_REGISTRY: Partial<Record<RoomId, ComponentType<RoomProps>>> = {
  'room-02': lazy(() => import('./room-02/Room02').then((m) => ({ default: m.Room02 }))),
}
