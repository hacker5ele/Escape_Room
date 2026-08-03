import { useEffect, useState } from 'react'
import { ROOM_IDS } from '@escape-room/shared'
import { fetchHealth } from './api/health'

type BackendState = { kind: 'checking' } | { kind: 'up'; uptime: number } | { kind: 'down' }

/**
 * The scaffold page.
 *
 * It exists to prove three things work before anyone builds a room: React and
 * Tailwind render, the shared contract package imports on the frontend, and
 * the browser can reach the backend through the /api proxy.
 *
 * The rooms replace this. See ADR-0007 for where each sub-team's code goes.
 */
export function App() {
  const [backend, setBackend] = useState<BackendState>({ kind: 'checking' })

  useEffect(() => {
    let cancelled = false

    fetchHealth()
      .then((health) => {
        if (!cancelled) setBackend({ kind: 'up', uptime: health.uptime })
      })
      .catch(() => {
        if (!cancelled) setBackend({ kind: 'down' })
      })

    return () => {
      cancelled = true
    }
  }, [])

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-10 px-6 py-16">
      <header className="space-y-3">
        <p className="font-mono text-xs tracking-[0.3em] text-signal-400 uppercase">
          Projektwoche KW 32
        </p>
        <h1 className="font-mono text-4xl font-semibold text-vault-100 sm:text-5xl">
          Der digitale Escape Room
        </h1>
        <p className="text-vault-300">
          The scaffold is up. Nothing is built yet — the rooms are next.
        </p>
      </header>

      <section className="rounded-lg border border-vault-800 bg-vault-900/60 p-5">
        <h2 className="font-mono text-xs tracking-[0.2em] text-vault-500 uppercase">Backend</h2>
        <p className="mt-3 flex items-center gap-3">
          <span
            aria-hidden="true"
            className={`inline-block size-2.5 rounded-full ${
              backend.kind === 'up'
                ? 'bg-solved-400'
                : backend.kind === 'down'
                  ? 'bg-alarm-400'
                  : 'bg-vault-500'
            }`}
          />
          <span className="font-mono text-sm text-vault-100">
            {backend.kind === 'checking' && 'Checking /api/health…'}
            {backend.kind === 'up' && `Reachable — up ${backend.uptime}s`}
            {backend.kind === 'down' && 'Not reachable'}
          </span>
        </p>
        {backend.kind === 'down' && (
          <p className="mt-3 text-sm text-vault-300">
            Start it with <code className="font-mono text-signal-300">npm run dev</code> from the
            repository root, which runs the backend and this app together.
          </p>
        )}
      </section>

      <section className="rounded-lg border border-vault-800 bg-vault-900/60 p-5">
        <h2 className="font-mono text-xs tracking-[0.2em] text-vault-500 uppercase">
          Rooms in the contract
        </h2>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {ROOM_IDS.map((roomId, index) => (
            <li
              key={roomId}
              className="flex items-center gap-3 rounded border border-vault-800 px-3 py-2 font-mono text-sm text-vault-300"
            >
              <span className="text-signal-400">{index + 1}</span>
              {roomId}
            </li>
          ))}
        </ul>
        <p className="mt-4 text-sm text-vault-500">
          This list comes from <code className="font-mono">@escape-room/shared</code> — the same
          declaration the backend uses. Change it there and both sides follow.
        </p>
      </section>
    </main>
  )
}
