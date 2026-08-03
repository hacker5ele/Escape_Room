import { useState } from 'react'
import { useUser } from '@clerk/react'

/**
 * Collects a first and last name when Clerk did not.
 *
 * Clerk can ask for a name during sign-up (dashboard → Configure → Email,
 * phone, username → Personal information), and when that is enabled this
 * component never appears. It exists so the game is not at the mercy of that
 * setting, and so accounts created through a social provider that returns no
 * name still end up with one.
 *
 * The name is written back to the Clerk profile rather than stored alongside
 * the game, so identity stays in one place. It is collected *before* the game
 * is created, so the player name recorded on the game is never stale.
 */
export function NameForm({ onSaved }: { onSaved: () => void }) {
  const { user } = useUser()
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Typed structurally rather than with React's `FormEvent`, which is
  // deprecated in the React 19 types.
  async function handleSubmit(event: { preventDefault: () => void }) {
    event.preventDefault()
    if (!user || saving) return

    const first = firstName.trim()
    const last = lastName.trim()
    if (!first || !last) {
      setError('Both names are needed.')
      return
    }

    setSaving(true)
    setError(null)
    try {
      await user.update({ firstName: first, lastName: last })
      onSaved()
    } catch {
      setError('Could not save that. Try again.')
      setSaving(false)
    }
  }

  return (
    <section className="rounded-lg border border-vault-800 bg-vault-900/60 p-6">
      <h2 className="font-mono text-sm text-vault-100">Before you go in</h2>
      <p className="mt-2 text-sm text-vault-300">
        We need a name to put on your game.
      </p>

      <form
        onSubmit={(event) => {
          void handleSubmit(event)
        }}
        className="mt-5 space-y-4"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="font-mono text-xs tracking-[0.2em] text-vault-500 uppercase">
              First name
            </span>
            <input
              value={firstName}
              onChange={(event) => setFirstName(event.target.value)}
              autoComplete="given-name"
              maxLength={50}
              required
              className="mt-1 w-full rounded border border-vault-700 bg-vault-950 px-3 py-2 font-mono text-sm text-vault-100 outline-none focus:border-signal-400"
            />
          </label>

          <label className="block">
            <span className="font-mono text-xs tracking-[0.2em] text-vault-500 uppercase">
              Last name
            </span>
            <input
              value={lastName}
              onChange={(event) => setLastName(event.target.value)}
              autoComplete="family-name"
              maxLength={50}
              required
              className="mt-1 w-full rounded border border-vault-700 bg-vault-950 px-3 py-2 font-mono text-sm text-vault-100 outline-none focus:border-signal-400"
            />
          </label>
        </div>

        {error && (
          <p role="alert" className="font-mono text-sm text-alarm-400">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={saving}
          className="rounded bg-signal-400 px-4 py-2 font-mono text-sm font-semibold text-vault-950 transition hover:bg-signal-300 disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Enter the first room'}
        </button>
      </form>
    </section>
  )
}
