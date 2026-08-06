import { useContext } from 'react'
import { SyncContext, type SyncState } from './SyncProvider'

/**
 * The shared poll.
 *
 * Falls back to an inert state rather than throwing when there is no provider,
 * so a component using it can still be rendered on its own in a test.
 */
export function useSync(): SyncState {
  return (
    useContext(SyncContext) ?? {
      notifications: [],
      unreadCount: 0,
      markAllRead: () => undefined,
      refresh: () => undefined,
    }
  )
}
