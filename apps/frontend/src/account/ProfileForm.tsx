import { useState } from 'react'
import { useUser } from '@clerk/react'

/**
 * Collects the profile details the game needs when Clerk does not already have
 * them: a unique username, and a name to show.
 *
 * Clerk can ask for all three during sign-up (dashboard → Configure → Email,
 * phone, username), and when that is configured this never appears. It exists
 * so the game does not depend on that setting, and so accounts created through
 * a social provider — which often return no username — still end up with one.
 *
 * Uniqueness is Clerk's job, not ours. `user.update()` rejects a username that
 * is taken, and that rejection is surfaced below. Checking it ourselves would
 * mean a second index and a race between the check and the write.
 */
export function ProfileForm({ onSaved }: { onSaved: () => void }) {
  const { user } = useUser()
  const [username, setUsername] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Typed structurally rather than with React's `FormEvent`, which is
  // deprecated in the React 19 types.
  async function handleSubmit(event: { preventDefault: () => void }) {
    event.preventDefault()
    if (!user || saving) return

    const handle = username.trim()
    const first = firstName.trim()
    const last = lastName.trim()

    if (!handle || !first || !last) {
      setError('All three fields are needed.')
      return
    }

    setSaving(true)
    setError(null)
    try {
      await user.update({ username: handle, firstName: first, lastName: last })
      onSaved()
    } catch (caught) {
      setError(describeClerkError(caught))
      setSaving(false)
    }
  }

  return (
    <section className="rounded-lg border border-vault-800 bg-vault-900/60 p-6">
      <h2 className="font-mono text-sm text-vault-100">Before you go in</h2>
      <p className="mt-2 text-sm text-vault-300">
        Pick a username — it has to be unique, and it is what other players will see.
      </p>

      <form
        onSubmit={(event) => {
          void handleSubmit(event)
        }}
        className="mt-5 space-y-4"
      >
        <label className="block">
          <span className="font-mono text-xs tracking-[0.2em] text-vault-500 uppercase">
            Username
          </span>
          <input
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            autoComplete="username"
            maxLength={32}
            required
            className="mt-1 w-full rounded border border-vault-700 bg-vault-950 px-3 py-2 font-mono text-sm text-vault-100 outline-none focus:border-signal-400"
          />
        </label>

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

/**
 * Turns a Clerk rejection into something a player can act on.
 *
 * The one that matters is a taken username — a generic "could not save" would
 * leave someone retyping the same handle forever.
 */
function describeClerkError(caught: unknown): string {
  const errors = (caught as { errors?: { code?: string; longMessage?: string; message?: string }[] })
    ?.errors

  const first = errors?.[0]
  if (!first) return 'Could not save that. Try again.'

  if (first.code === 'form_identifier_exists') {
    return 'That username is taken. Pick another.'
  }
  return first.longMessage ?? first.message ?? 'Could not save that. Try again.'
}
