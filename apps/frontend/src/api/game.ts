import type {
  AttemptResponse,
  GameSession,
  HintResponse,
  RoomCompleteResponse,
  RoomId,
  RoomPublicData,
  RoomResetResponse,
} from '@escape-room/shared'
import {
  attemptResponseSchema,
  hintResponseSchema,
  roomCompleteResponseSchema,
  roomPublicDataSchema,
  roomResetResponseSchema,
} from '@escape-room/shared'
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

/** Fetches a room's puzzle data. 403s (via ApiRequestError) if it is still locked. */
export async function fetchRoom(
  authHeaders: Record<string, string>,
  roomId: RoomId,
): Promise<RoomPublicData> {
  const response = await request(`/rooms/${roomId}`, authHeaders)
  const body = (await response.json()) as { room: unknown }
  return roomPublicDataSchema.parse(body.room)
}

/** Submits an answer for checking. The server is the only place it is validated. */
export async function submitAttempt(
  authHeaders: Record<string, string>,
  roomId: RoomId,
  answer: unknown,
): Promise<AttemptResponse> {
  const response = await request(`/rooms/${roomId}/attempt`, authHeaders, {
    method: 'POST',
    body: JSON.stringify({ answer }),
  })
  return attemptResponseSchema.parse(await response.json())
}

/** Reveals the next hint for a room, in order. */
export async function requestHint(
  authHeaders: Record<string, string>,
  roomId: RoomId,
): Promise<HintResponse> {
  const response = await request(`/rooms/${roomId}/hint`, authHeaders, { method: 'POST', body: '{}' })
  return hintResponseSchema.parse(await response.json())
}

/** Wipes one room's progress only, leaving the rest of the game untouched. See ADR-0066. */
export async function resetRoom(
  authHeaders: Record<string, string>,
  roomId: RoomId,
): Promise<RoomResetResponse> {
  const response = await request(`/rooms/${roomId}/reset`, authHeaders, { method: 'POST', body: '{}' })
  return roomResetResponseSchema.parse(await response.json())
}

/** Marks a room solved with no answer involved, for a room whose final stage(s) are client-side. See ADR-0070. */
export async function completeRoom(
  authHeaders: Record<string, string>,
  roomId: RoomId,
): Promise<RoomCompleteResponse> {
  const response = await request(`/rooms/${roomId}/complete`, authHeaders, {
    method: 'POST',
    body: '{}',
  })
  return roomCompleteResponseSchema.parse(await response.json())
}
