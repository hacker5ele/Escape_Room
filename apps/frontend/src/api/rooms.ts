import type { AttemptResponse, HintResponse, RoomId, RoomResponse } from '@escape-room/shared'
import { attemptResponseSchema, hintResponseSchema, roomResponseSchema } from '@escape-room/shared'
import { request } from './client'

type Headers = Record<string, string>

/** See ADR-0005 — parsed against the shared schema, never cast. */
async function parsed<T>(response: Response, schema: { parse: (input: unknown) => T }): Promise<T> {
  return schema.parse(await response.json())
}

/** `403 ROOM_LOCKED` if any preceding room is unsolved — the frontend never sees its contents. */
export async function getRoom(auth: Headers, roomId: RoomId): Promise<RoomResponse> {
  return parsed(await request(`/rooms/${roomId}`, auth), roomResponseSchema)
}

export async function submitAttempt(
  auth: Headers,
  roomId: RoomId,
  answer: unknown,
): Promise<AttemptResponse> {
  const response = await request(`/rooms/${roomId}/attempt`, auth, {
    method: 'POST',
    body: JSON.stringify({ answer }),
  })
  return parsed(response, attemptResponseSchema)
}

export async function requestHint(auth: Headers, roomId: RoomId): Promise<HintResponse> {
  const response = await request(`/rooms/${roomId}/hint`, auth, { method: 'POST' })
  return parsed(response, hintResponseSchema)
}
