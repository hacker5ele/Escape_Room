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

/**
 * Leaving the stage — stop showing me to the others.
 *
 * Takes your character out of the room and leaves your claim on the party
 * exactly where it is: walking to the leaderboard is not leaving your friend's
 * game. Called when the lobby or a room unmounts, which is the one departure
 * that is a real click rather than a guess about an unloading page — so it is
 * the one that happens at once rather than on a timeout (ADR-0045).
 */
export async function leaveStage(): Promise<void> {
  if (!headersFor) return
  await request('/stage', await headersFor(), { method: 'DELETE' }).catch(() => undefined)
}

/**
 * When the stage last told the server we are here.
 *
 * Shared so `useLiveness` — which beats from every screen — can stay quiet
 * while the stage is beating twice a second and renewing the same claim. A
 * module-level clock rather than a prop, because the two live on opposite sides
 * of the router and neither owns the other.
 */
let lastStageBeat = 0

export function markStageBeat(): void {
  lastStageBeat = Date.now()
}

export function stageBeatAt(): number {
  return lastStageBeat
}
