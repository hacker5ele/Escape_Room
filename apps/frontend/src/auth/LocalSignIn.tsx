import { useState } from 'react'
import { useAppAuth } from './useAppAuth'

/**
 * The development sign-in: a username and a name, and you are in.
 *
 * Replaces Clerk's modal entirely when the app is built with
 * `VITE_AUTH_MODE=local`, which `npm run dev` does — so nobody needs keys, an
 * account, or a network to work on a room.
 *
 * Signing in with a username you have used before resumes that game, which is
 * how you check that progress survives a restart.
 */
export function LocalSignIn() {
  const { signIn } = useAppAuth()
  const [username, setUsername] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [error, setError] = useState<string | null>(null)

  // Typed structurally rather than with React's `FormEvent`, which is
  // deprecated in the React 19 types.
  function handleSubmit(event: { preventDefault: () => void }) {
    event.preventDefault()

    const handle = username.trim()
    const first = firstName.trim()
    const last = lastName.trim()

    if (!handle || !first || !last) {
      setError('All three fields are needed.')
      return
    }

    signIn?.({ username: handle, firstName: first, lastName: last })
  }

  return (
    <section className="rounded-lg border border-signal-500/40 bg-vault-900/60 p-6">
      <p className="font-mono text-xs tracking-[0.2em] text-signal-400 uppercase">
        Local development
      </p>
      <h2 className="mt-2 font-mono text-sm text-vault-100">Sign in as anyone</h2>
      <p className="mt-2 text-sm text-vault-300">
        No account and no password — this mode exists so you can build rooms without Clerk. Reuse a
        username to pick up that game again.
      </p>

      <form onSubmit={handleSubmit} className="mt-5 space-y-4">
        <label className="block">
          <span className="font-mono text-xs tracking-[0.2em] text-vault-500 uppercase">
            Username
          </span>
          <input
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            autoComplete="off"
            maxLength={64}
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
              autoComplete="off"
              maxLength={64}
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
              autoComplete="off"
              maxLength={64}
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
          className="rounded bg-signal-400 px-4 py-2 font-mono text-sm font-semibold text-vault-950 transition hover:bg-signal-300"
        >
          Enter
        </button>
      </form>
    </section>
  )
}
