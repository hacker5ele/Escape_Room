import { createContext, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Notification } from '@escape-room/shared'
import { fetchSync, markNotificationsRead } from '../api/sync'
import { useAppAuth } from '../auth/useAppAuth'

export interface SyncState {
  notifications: Notification[]
  unreadCount: number
  markAllRead: () => void
  /** Poll now rather than waiting for the next tick — used after an action. */
  refresh: () => void
}

export const SyncContext = createContext<SyncState | null>(null)

/** How often to ask, when the tab is in front. */
const VISIBLE_INTERVAL_MS = 10_000

/** Newest first, and bounded — the bell is a recent-activity list, not an archive. */
const KEEP = 50

/**
 * One poll for the whole app.
 *
 * App Runner does not support WebSockets, and its proxy cuts a request at about
 * thirty seconds, so server-sent events are impractical too. Polling is what is
 * left; the job here is to make it cheap. See ADR-0025.
 *
 * Three things keep it cheap. Polling stops entirely while the tab is hidden,
 * which is most of the time for most tabs. The interval is a chained timeout
 * rather than `setInterval`, so a slow response delays the next request instead
 * of stacking another on top of it. And every feature shares this one provider,
 * so adding chat later costs no extra requests.
 */
export function SyncProvider({ children }: { children: React.ReactNode }) {
  const { isSignedIn, authHeaders } = useAppAuth()
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)

  const authRef = useRef(authHeaders)
  authRef.current = authHeaders

  /** Server-issued, never the browser's clock — see the schema comment. */
  const cursorRef = useRef<string | undefined>(undefined)

  const poll = useCallback(async (signal?: AbortSignal) => {
    try {
      const body = await fetchSync(await authRef.current(), cursorRef.current, signal)
      cursorRef.current = body.now

      setUnreadCount(body.unreadCount)

      if (body.notifications.length > 0) {
        setNotifications((current) => merge(current, body.notifications))
      }
    } catch {
      // Swallowed on purpose. A failed poll is a transient thing — an expired
      // token being refreshed, a container restarting, a phone changing
      // network. The next tick tries again, and an error banner that flickers
      // every ten seconds is worse than a badge that updates late.
    }
  }, [])

  useEffect(() => {
    if (!isSignedIn) {
      // Leaving stale notifications on screen after a sign-out would show one
      // account's business to whoever signs in next.
      setNotifications([])
      setUnreadCount(0)
      cursorRef.current = undefined
      return
    }

    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined

    const tick = async () => {
      if (controller.signal.aborted) return
      // Nothing on screen is changing, so nothing needs fetching. This is the
      // single biggest saving: a tab left open all afternoon costs nothing.
      if (document.visibilityState === 'visible') {
        await poll(controller.signal)
      }
      if (!controller.signal.aborted) {
        timer = setTimeout(() => void tick(), VISIBLE_INTERVAL_MS)
      }
    }

    // Coming back to the tab should feel immediate rather than up to a full
    // interval stale.
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void poll(controller.signal)
    }

    void tick()
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      controller.abort()
      if (timer) clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [isSignedIn, poll])

  const markAllRead = useCallback(() => {
    // Cleared here rather than waiting for the next poll: the badge should go
    // out the instant the bell is opened. The server is authoritative, and the
    // next poll corrects this if the write failed.
    setUnreadCount(0)
    setNotifications((current) =>
      current.map((n) => (n.readAt ? n : { ...n, readAt: new Date().toISOString() })),
    )
    void authRef
      .current()
      .then((auth) => markNotificationsRead(auth))
      .catch(() => undefined)
  }, [])

  const refresh = useCallback(() => void poll(), [poll])

  const value = useMemo<SyncState>(
    () => ({ notifications, unreadCount, markAllRead, refresh }),
    [notifications, unreadCount, markAllRead, refresh],
  )

  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>
}

/**
 * Folds a page of notifications into what is already on screen.
 *
 * Deduped by id because the server deliberately overlaps its window — it would
 * rather send something twice than lose it. Without this the bell would fill
 * with copies of the same request every ten seconds.
 */
function merge(current: Notification[], incoming: Notification[]): Notification[] {
  const byId = new Map(current.map((n) => [n.id, n]))
  for (const notification of incoming) byId.set(notification.id, notification)

  return [...byId.values()]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, KEEP)
}
