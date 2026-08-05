import type { PartyPhase } from '@escape-room/shared'
import { request } from './client'
import { useAppAuth } from '../auth/useAppAuth'

/**
 * Moving the party.
 *
 * Separate from the heartbeat because it happens once, when the host presses
 * PLAY — everything else about the stage travels on the beat.
 *
 * Auth headers are fetched here rather than passed in: this is called from an
 * event handler rather than a render, so there is no hook to read them from.
 */
let headersFor: (() => Promise<Record<string, string>>) | null = null

/** Registered once by the provider, so plain functions can still authenticate. */
export function useRegisterStageAuth(): void {
  const { authHeaders } = useAppAuth()
  headersFor = authHeaders
}

export async function setPhase(phase: PartyPhase): Promise<void> {
  if (!headersFor) return
  await request('/stage/phase', await headersFor(), {
    method: 'POST',
    body: JSON.stringify(phase),
  })
}

/** Leaving the stage entirely — stop showing me to the others. */
export async function leaveStage(): Promise<void> {
  if (!headersFor) return
  await request('/stage', await headersFor(), { method: 'DELETE' }).catch(() => undefined)
}
