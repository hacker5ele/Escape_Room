import type {
  ApiErrorCode,
  AttemptResponse,
  GameSession,
  HintResponse,
  RoomCompleteResponse,
  RoomId,
  RoomPublicData,
  RoomResetResponse,
} from '@escape-room/shared'

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

async function request(path: string, token: string | null, init: RequestInit = {}) {
  const response = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
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
export async function startOrResumeGame(token: string | null): Promise<GameSession> {
  const response = await request('/sessions', token, { method: 'POST', body: '{}' })
  const body = (await response.json()) as { session: GameSession }
  return body.session
}

/** Fetches a room's puzzle data. 403s (via ApiRequestError) if it is still locked. */
export async function fetchRoom(token: string | null, roomId: RoomId): Promise<RoomPublicData> {
  const response = await request(`/rooms/${roomId}`, token)
  const body = (await response.json()) as { room: RoomPublicData }
  return body.room
}

/** Submits an answer for checking. The server is the only place it is validated. */
export async function submitAttempt(
  token: string | null,
  roomId: RoomId,
  answer: unknown,
): Promise<AttemptResponse> {
  const response = await request(`/rooms/${roomId}/attempt`, token, {
    method: 'POST',
    body: JSON.stringify({ answer }),
  })
  return (await response.json()) as AttemptResponse
}

/** Reveals the next hint for a room, in order. */
export async function requestHint(token: string | null, roomId: RoomId): Promise<HintResponse> {
  const response = await request(`/rooms/${roomId}/hint`, token, { method: 'POST', body: '{}' })
  return (await response.json()) as HintResponse
}

/** Wipes one room's progress only, leaving the rest of the game untouched. See ADR-0023. */
export async function resetRoom(token: string | null, roomId: RoomId): Promise<RoomResetResponse> {
  const response = await request(`/rooms/${roomId}/reset`, token, { method: 'POST', body: '{}' })
  return (await response.json()) as RoomResetResponse
}

/** Marks a room solved with no answer involved, for a room whose final stage(s) are client-side. See ADR-0027. */
export async function completeRoom(token: string | null, roomId: RoomId): Promise<RoomCompleteResponse> {
  const response = await request(`/rooms/${roomId}/complete`, token, { method: 'POST', body: '{}' })
  return (await response.json()) as RoomCompleteResponse
}
