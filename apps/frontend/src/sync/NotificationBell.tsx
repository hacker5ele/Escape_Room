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
        className="relative rounded border border-vault-700 px-3 py-1.5 font-mono text-xs text-vault-300 transition hover:border-vault-500"
      >
        <span aria-hidden="true">Bell</span>
        {unreadCount > 0 && (
          <span
            data-testid="unread-badge"
            className="absolute -top-2 -right-2 min-w-5 rounded-full bg-signal-400 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-vault-950"
          >
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-10 mt-2 w-80 rounded-lg border border-vault-800 bg-vault-950 p-2 shadow-xl">
          {notifications.length === 0 ? (
            <p className="p-3 text-sm text-vault-500">Nothing yet.</p>
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
    <li className="flex items-start gap-3 rounded px-2 py-2 hover:bg-vault-900">
      {notification.actor ? (
        <Avatar subject={notification.actor} size={28} />
      ) : (
        <span className="h-7 w-7 shrink-0 rounded-full bg-vault-800" />
      )}
      <div className="min-w-0 flex-1">
        {/* Plain text. React escapes it, and nothing here uses
            dangerouslySetInnerHTML — a display name is somebody else's input. */}
        <p className="text-sm text-vault-100">{notification.message}</p>
        <p className="font-mono text-xs text-vault-600">{relativeTime(notification.createdAt)}</p>
      </div>
      {notification.readAt === null && (
        <span aria-hidden="true" className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-signal-400" />
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
