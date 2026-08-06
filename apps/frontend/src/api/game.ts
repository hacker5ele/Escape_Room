import type { GameSession } from '@escape-room/shared'
import { request } from './client'

// Re-exported so existing imports keep working; the class itself now lives in
// `client.ts`, which every API module shares.
export { ApiRequestError } from './client'

/** Starts the player's game, or returns the one they already have. */
export async function startOrResumeGame(
  authHeaders: Record<string, string>,
): Promise<GameSession> {
  const response = await request('/sessions', authHeaders, { method: 'POST', body: '{}' })
  const body = (await response.json()) as { session: GameSession }
  return body.session
}
