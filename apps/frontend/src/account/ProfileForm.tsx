import { useState } from 'react'
import { useAppAuth } from '../auth/useAppAuth'

/**
 * Collects whatever the game needs and Clerk does not already have: a unique
 * username, and a name to show.
 *
 * It asks only for the missing pieces. Clerk can require all three at sign-up
 * (dashboard → Configure → Email, phone, username), and when it does this
 * never appears at all. It exists so the game does not silently depend on those
 * settings, and so social sign-ups — which frequently return no username —
 * still end up with one.
 *
 * Uniqueness is Clerk's job, not ours. `user.update()` rejects a username that
 * is taken, and that rejection is surfaced below. Checking it ourselves would
 * mean a second index and a race between the check and the write.
 */
export function ProfileForm({ onSaved }: { onSaved: () => void }) {
  const { profile, updateProfile } = useAppAuth()

  const needsUsername = !profile?.username
  const needsName = !profile?.firstName || !profile?.lastName

  const [username, setUsername] = useState('')
  const [firstName, setFirstName] = useState(profile?.firstName ?? '')
  const [lastName, setLastName] = useState(profile?.lastName ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Typed structurally rather than with React's `FormEvent`, which is
  // deprecated in the React 19 types.
  async function handleSubmit(event: { preventDefault: () => void }) {
    event.preventDefault()
    if (saving) return

    const handle = username.trim()
    const first = firstName.trim()
    const last = lastName.trim()

    if ((needsUsername && !handle) || (needsName && (!first || !last))) {
      setError('Please fill in every field.')
      return
    }

    setSaving(true)
    setError(null)
    try {
      // Only send what we asked for — writing a field back unchanged would be
      // a pointless way to fail on an unrelated Clerk validation rule.
      await updateProfile({
        ...(needsUsername ? { username: handle } : {}),
        ...(needsName ? { firstName: first, lastName: last } : {}),
      })
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
        {needsUsername
          ? 'Pick a username — it has to be unique, and it is what other players will see.'
          : 'We just need a name to put on your game.'}
      </p>

      <form
        onSubmit={(event) => {
          void handleSubmit(event)
        }}
        className="mt-5 space-y-4"
      >
        {needsUsername && (
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
        )}

        {needsName && (
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
        )}

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

  // Clerk rejects the parameter outright when the instance does not have
  // usernames switched on — and its own wording ("username is not a valid
  // parameter for this request") reads like the player typed something wrong,
  // so they retype it for ever. The setting is per instance, so a development
  // instance can have it off while production has it on.
  //
  // The game cannot start without a username (ADR-0021), so there is nothing to
  // do but say plainly whose problem this is.
  if (first.code === 'form_param_unknown') {
    return (
      'This site is not set up to accept usernames yet, so your profile cannot be saved. ' +
      'Whoever administers it needs to enable Username for this Clerk instance.'
    )
  }

  return first.longMessage ?? first.message ?? 'Could not save that. Try again.'
}
