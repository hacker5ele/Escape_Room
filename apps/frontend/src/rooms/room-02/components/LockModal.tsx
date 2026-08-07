import { useEffect, useRef, useState } from 'react'
import { LOCKS, type LockKind } from '../story'

export function LockModal({
  open,
  kind,
  attempts,
  onSubmit,
  onClose,
}: {
  open: boolean
  kind: LockKind | null
  attempts: number
  onSubmit: (value: string) => Promise<boolean>
  onClose: () => void
}) {
  const [value, setValue] = useState('')
  const [showError, setShowError] = useState(false)
  const [shaking, setShaking] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const shakeTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => {
    if (open) {
      setValue('')
      setShowError(false)
      inputRef.current?.focus()
    }
  }, [open, kind])

  if (!open || !kind) return null
  const lock = LOCKS[kind]
  const showHint = attempts >= 3

  async function handleSubmit() {
    if (submitting) return
    setSubmitting(true)
    try {
      const correct = await onSubmit(value)
      if (!correct) {
        setShowError(true)
        setShaking(false)
        clearTimeout(shakeTimeout.current)
        requestAnimationFrame(() => {
          setShaking(true)
          shakeTimeout.current = setTimeout(() => setShaking(false), 400)
        })
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="modal-backdrop">
      <div className="modal lock-modal">
        <div className="modal-header">
          <span className="modal-icon badge">LOCK</span>
          <span className="modal-title">{lock.title}</span>
          <button type="button" className="modal-close" onClick={onClose}>
            X
          </button>
        </div>
        <div className="modal-body">
          <p className="lock-instructions">{lock.instructions}</p>
          <div className="password-row">
            <input
              ref={inputRef}
              type="text"
              className={`password-input${shaking ? ' shake' : ''}`}
              autoComplete="off"
              spellCheck={false}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleSubmit()
              }}
            />
            <button type="button" className="btn btn-terminal" disabled={submitting} onClick={() => void handleSubmit()}>
              SUBMIT
            </button>
          </div>
          {showError && <p className="terminal-error">ACCESS DENIED</p>}
          {showHint && <p className="terminal-hint">{lock.hint}</p>}
        </div>
      </div>
    </div>
  )
}
