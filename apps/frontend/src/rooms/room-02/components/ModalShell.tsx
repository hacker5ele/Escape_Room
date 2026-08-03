import type { ReactNode } from 'react'

/** Shared chrome for every modal: backdrop, header with a badge icon, close button. */
export function ModalShell({
  open,
  className,
  icon,
  title,
  onClose,
  children,
  terminal,
}: {
  open: boolean
  className: string
  icon: string
  title: string
  onClose: () => void
  children: ReactNode
  terminal?: boolean
}) {
  if (!open) return null
  return (
    <div className="modal-backdrop">
      <div className={className}>
        <div className={`modal-header${terminal ? ' terminal-header' : ''}`}>
          <span className="modal-icon badge">{icon}</span>
          <span className="modal-title">{title}</span>
          <button type="button" className="modal-close" onClick={onClose}>
            X
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
