import type { GameSession } from '@escape-room/shared'

/**
 * The API calls that need a signed-in user.
 *
 * Every one takes the Clerk token as an argument rather than reaching for it
 * itself — `getToken()` is a hook-bound function, and threading it in keeps
 * this module plain and testable.
 *
 * Note the relative path: no backend URL is compiled into the frontend. Vite
 * proxies `/api` in development and nginx does in production. See ADR-0009.
 */
const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '/api'

async function authorized(
  path: string,
  token: string | null,
  init: RequestInit = {},
): Promise<Response> {
  return fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  })
}

/** Starts the player's game, or returns the one they already have. */
export async function startOrResumeGame(token: string | null): Promise<GameSession> {
  const response = await authorized('/sessions', token, { method: 'POST', body: '{}' })
  if (!response.ok) {
    throw new Error(`Could not start a game (${response.status})`)
  }
  const body = (await response.json()) as { session: GameSession }
  return body.session
}
