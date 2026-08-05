import { useEffect, useRef, useState } from 'react'
import type { Notification } from '@escape-room/shared'
import { Avatar } from '../social/Avatar'
import { useSync } from './useSync'

/**
 * The bell and its unread badge.
 *
 * Opening it marks everything read, which is what people expect and saves any
 * per-notification read state. The list stays visible afterwards — seen is not
 * the same as gone.
 */
export function NotificationBell() {
  const { notifications, unreadCount, markAllRead } = useSync()
  const [open, setOpen] = useState(false)
  const container = useRef<HTMLDivElement>(null)

  // Click-away and Escape. A panel that can only be closed by the button that
  // opened it is a panel people leave open by accident.
  useEffect(() => {
    if (!open) return

    const onPointerDown = (event: PointerEvent) => {
      if (!container.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }

    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const toggle = () => {
    setOpen((wasOpen) => {
      if (!wasOpen && unreadCount > 0) markAllRead()
      return !wasOpen
    })
  }

  return (
    <div ref={container} className="relative">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-label={
          unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications, none unread'
        }
        className="relative btn btn-ghost btn-sm"
      >
        <span aria-hidden="true">Bell</span>
        {unreadCount > 0 && (
          <span
            data-testid="unread-badge"
            className="absolute -top-2 -right-2 min-w-5 rounded-full bg-signal-500 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-stock-50"
          >
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        // Never wider than the screen it drops onto: at a fixed 20rem this ran
        // off the left edge of a small phone, since it is anchored to the bell
        // on the right.
        <div className="pane absolute right-0 z-10 mt-2 w-[min(20rem,calc(100vw-2.5rem))] p-2">
          {notifications.length === 0 ? (
            <p className="p-3 text-sm text-stock-600">Nothing yet.</p>
          ) : (
            <ul className="max-h-96 space-y-1 overflow-y-auto">
              {notifications.map((notification) => (
                <Row key={notification.id} notification={notification} />
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

function Row({ notification }: { notification: Notification }) {
  return (
    <li className="flex items-start gap-3 rounded px-2 py-2 hover:bg-stock-100">
      {notification.actor ? (
        <Avatar subject={notification.actor} size={28} />
      ) : (
        <span className="h-7 w-7 shrink-0 rounded-full bg-stock-200" />
      )}
      <div className="min-w-0 flex-1">
        {/* Plain text. React escapes it, and nothing here uses
            dangerouslySetInnerHTML — a display name is somebody else's input. */}
        <p className="text-sm text-stock-900">{notification.message}</p>
        <p className="font-mono text-xs text-stock-500">{relativeTime(notification.createdAt)}</p>
      </div>
      {notification.readAt === null && (
        <span aria-hidden="true" className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-signal-500" />
      )}
    </li>
  )
}

/** Rough on purpose — "3m ago" is more use here than a timestamp. */
function relativeTime(iso: string): string {
  const seconds = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000))
  if (seconds < 60) return 'just now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)}h ago`
  return `${Math.floor(seconds / 86_400)}d ago`
}
