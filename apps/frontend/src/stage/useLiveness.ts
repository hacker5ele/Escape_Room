import { useEffect, useRef } from 'react'
import { LIVENESS_BEAT_MS } from '@escape-room/shared'
import { request } from '../api/client'
import { useAppAuth } from '../auth/useAppAuth'
import { stageBeatAt } from '../api/stage'

/**
 * "I still have the game open."
 *
 * Mounted once, above every screen behind the gate — because being in a
 * friend's game is not something the lobby owns. You can be playing with
 * somebody while reading the leaderboard, and since ADR-0045 a party is a claim
 * you keep alive rather than a row somebody has to delete. Stop beating and you
 * leave the lobby *and* the game, which is the point; beat from only one screen
 * and you would leave the game by walking to another tab, which is not.
 *
 * **It does not stop while the tab is hidden**, unlike `/api/sync` (ADR-0025).
 * Stopping is indistinguishable from closing, and telling those two apart is
 * the whole feature. It reports which it is instead, and the server is patient
 * with a hidden tab because the browser throttles it.
 */
export function useLiveness({ enabled = true }: { enabled?: boolean } = {}): void {
  const { authHeaders } = useAppAuth()

  // Held in a ref: `authHeaders` is a fresh function every render, and
  // depending on it would tear down and restart the beat every render
  // (ADR-0041).
  const authRef = useRef(authHeaders)
  authRef.current = authHeaders

  useEffect(() => {
    // Nobody to be alive as. Without this the locked door beats a 401 every
    // five seconds for as long as somebody sits on it.
    if (!enabled) return

    let stopped = false
    let timer: number | undefined

    // Chained rather than `setInterval`, so a slow response delays the next
    // beat instead of stacking one on top of it.
    const schedule = () => {
      if (!stopped) timer = window.setTimeout(() => void beat(), LIVENESS_BEAT_MS)
    }

    const beat = async () => {
      // The stage beats twice a second and renews the same claim, so on the
      // stage this one has nothing to say. Read from a shared clock rather than
      // threaded down through the router as a prop.
      if (Date.now() - stageBeatAt() < LIVENESS_BEAT_MS) {
        schedule()
        return
      }

      try {
        await request('/stage/alive', await authRef.current(), {
          method: 'POST',
          body: JSON.stringify({ hidden: document.visibilityState === 'hidden' }),
        })
      } catch {
        // A dropped beat is not worth showing anybody, and there is nothing to
        // retry: the next is five seconds away and the timeout is three of them.
      } finally {
        schedule()
      }
    }

    void beat()
    return () => {
      stopped = true
      window.clearTimeout(timer)
    }
  }, [enabled])
}
