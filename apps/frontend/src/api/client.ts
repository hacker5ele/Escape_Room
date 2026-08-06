import type { ApiErrorCode } from '@escape-room/shared'

/**
 * The one place the frontend talks to the API.
 *
 * Note the relative path: no backend URL is compiled into the frontend. Vite
 * proxies `/api` in development and CloudFront routes it in production. See
 * ADR-0009.
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

  /** The link is unknown, revoked or expired. The API does not say which. */
  get inviteInvalid(): boolean {
    return this.code === 'INVITE_INVALID'
  }
}

export async function request(
  path: string,
  authHeaders: Record<string, string>,
  init: RequestInit = {},
): Promise<Response> {
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

/** For the handful of endpoints that work without an account — the invite preview. */
export function requestPublic(path: string, init: RequestInit = {}): Promise<Response> {
  return request(path, {}, init)
}
