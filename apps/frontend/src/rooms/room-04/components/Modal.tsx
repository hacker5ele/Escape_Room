import type { ReactNode } from 'react'

interface ModalProps {
  title: string
  onClose?: () => void
  children: ReactNode
  className?: string
}

export function Modal({ title, onClose, children, className }: ModalProps) {
  return (
    <div className="r4-modal-backdrop" onClick={onClose}>
      <div className={`r4-modal${className ? ` ${className}` : ''}`} onClick={(e) => e.stopPropagation()}>
        {onClose && (
          <button className="r4-modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        )}
        <h2>{title}</h2>
        {children}
      </div>
    </div>
  )
}
