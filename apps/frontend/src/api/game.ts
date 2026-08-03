import type { ApiErrorCode, GameSession } from '@escape-room/shared'

/**
 * The API calls that need a signed-in user.
 *
 * Each takes the Clerk token as an argument rather than reaching for it
 * itself — `getToken()` is hook-bound, and threading it in keeps this module
 * plain and testable.
 *
 * Note the relative path: no backend URL is compiled into the frontend. Vite
 * proxies `/api` in development and nginx does in production. See ADR-0009.
 */
const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '/api'

/** Carries the API's error code so callers can branch on it rather than on a message. */
export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: ApiErrorCode | 'UNKNOWN',
    message: string,
  ) {
    super(message)
    this.name = 'ApiRequestError'
  }

  /** Signed in, but Clerk has no username yet — the profile form handles this. */
  get needsProfile(): boolean {
    return this.code === 'PROFILE_INCOMPLETE'
  }
}

async function request(
  path: string,
  authHeaders: Record<string, string>,
  init: RequestInit = {},
) {
  const response = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      // Whatever identifies the caller — a Clerk bearer token in a deployment,
      // or the dev headers locally. This module does not care which.
      ...authHeaders,
      ...init.headers,
    },
  })

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: { code?: ApiErrorCode; message?: string }
    } | null

    throw new ApiRequestError(
      response.status,
      body?.error?.code ?? 'UNKNOWN',
      body?.error?.message ?? `Request failed (${response.status})`,
    )
  }

  return response
}

/** Starts the player's game, or returns the one they already have. */
export async function startOrResumeGame(
  authHeaders: Record<string, string>,
): Promise<GameSession> {
  const response = await request('/sessions', authHeaders, { method: 'POST', body: '{}' })
  const body = (await response.json()) as { session: GameSession }
  return body.session
}
