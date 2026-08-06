import { useEffect, useRef, useState } from 'react'
import { play } from '../../audio/sfx'

/**
 * The vault, full screen.
 *
 * Six drums off an old water meter. Built on the `.countdown` precedent — fixed
 * inset, dimmed, blurred — because that is the app's existing way of saying
 * *everything else can wait*, and the climax of the room deserves the same
 * treatment pressing PLAY gets.
 *
 * **A real `<input>` sits behind the drums**, invisible and focused. It looks
 * like a trick and it is doing three jobs honestly: typing works without a
 * hand-rolled key handler, mobile gets its numeric keyboard, and `useMovement`
 * already ignores WASD while a text field has focus — so walking suspends
 * itself while the vault is open with no new wiring at all.
 */

const LENGTH = 6

export function Vault({
  fragments,
  drowned,
  busy,
  shake,
  onSubmit,
  onClose,
}: {
  /** The figures earned so far, printed above so nobody has to remember them. */
  fragments: string[]
  /** The drums are under water and will not take anything. */
  drowned: boolean
  busy: boolean
  /** The last try was wrong. */
  shake: boolean
  onSubmit: (code: string) => void
  onClose: () => void
}) {
  const [code, setCode] = useState('')
  const field = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    field.current?.focus()
  }, [])

  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [onClose])

  const set = (next: string) => {
    setCode(next.replace(/\D/g, '').slice(0, LENGTH))
  }

  /** One drum, rolled by a nudge rather than retyped. */
  const roll = (index: number, by: number) => {
    const digits = code.padEnd(LENGTH, '0').split('')
    const current = Number(digits[index] ?? '0')
    digits[index] = String((current + by + 10) % 10)
    setCode(digits.join('').slice(0, LENGTH))
    play('click')
  }

  const digits = code.padEnd(LENGTH, ' ').split('')

  return (
    <div className="hall-vault-screen" role="dialog" aria-modal="true" aria-label="The vault">
      <div className="hall-vault-panel" data-shake={shake ? '' : undefined}>
        <p className="hall-vault-title" data-text="THE VAULT">
          THE VAULT
        </p>

        <p className="hall-vault-known">
          {fragments.length > 0
            ? `YOU HAVE ${fragments.join(' · ')}`
            : 'YOU HAVE NOTHING YET — THE HALL HAS TO GIVE UP ITS FIGURES FIRST'}
        </p>

        <form
          className="hall-drums"
          onSubmit={(event) => {
            event.preventDefault()
            if (code.length === LENGTH && !drowned) onSubmit(code)
          }}
        >
          {digits.map((digit, index) => (
            <span className="hall-drum" key={index}>
              <button
                type="button"
                className="hall-drum-nudge"
                onClick={() => roll(index, 1)}
                disabled={drowned || busy}
                aria-label={`Roll drum ${index + 1} up`}
              >
                ▲
              </button>
              <span className="hall-drum-face" data-set={digit.trim() ? '' : undefined}>
                {digit.trim() || '·'}
              </span>
              <button
                type="button"
                className="hall-drum-nudge"
                onClick={() => roll(index, -1)}
                disabled={drowned || busy}
                aria-label={`Roll drum ${index + 1} down`}
              >
                ▼
              </button>
            </span>
          ))}

          {/* Invisible, focused, and load-bearing — see the note at the top. */}
          <input
            ref={field}
            className="hall-drum-input"
            value={code}
            onChange={(event) => set(event.target.value)}
            inputMode="numeric"
            autoComplete="off"
            maxLength={LENGTH}
            disabled={drowned}
            aria-label="The six figures"
          />
        </form>

        <div className="hall-vault-actions">
          <button
            type="button"
            className="btn"
            disabled={drowned || busy || code.length < LENGTH}
            onClick={() => onSubmit(code)}
          >
            {drowned ? 'Under water' : 'Open it'}
          </button>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Back off
          </button>
        </div>

        <p className="hall-vault-hint">
          {drowned
            ? 'Get the level down and come back. The drums will not turn under water.'
            : 'Type the figures, or nudge the drums. Escape to step away.'}
        </p>
      </div>
    </div>
  )
}
