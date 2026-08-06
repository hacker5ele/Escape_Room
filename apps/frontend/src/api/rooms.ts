import type { AttemptResponse, HintResponse, RoomId, RoomPublicData } from '@escape-room/shared'
import { attemptResponseSchema, hintResponseSchema, roomPublicDataSchema } from '@escape-room/shared'
import { request } from './client'

/**
 * The three calls that make a room playable.
 *
 * Every response is parsed with the shared schema rather than cast. The server
 * is the authority on puzzle state (ADR-0006), so a payload that does not match
 * the contract should fail here, loudly, instead of halfway through rendering a
 * room.
 */

/** The room's contents. Answers 403 unless every preceding room is solved. */
export async function enterRoom(
  roomId: RoomId,
  authHeaders: Record<string, string>,
): Promise<RoomPublicData> {
  const response = await request(`/rooms/${roomId}`, authHeaders)
  const body = (await response.json()) as { room: unknown }
  return roomPublicDataSchema.parse(body.room)
}

/**
 * Submits an answer.
 *
 * `answer` is `unknown` on purpose: a room decides what its answer looks like —
 * a string, a number, an ordered list — and only the server knows which. The
 * contract calls it `z.unknown()` for the same reason.
 */
export async function attemptRoom(
  roomId: RoomId,
  answer: unknown,
  authHeaders: Record<string, string>,
): Promise<AttemptResponse> {
  const response = await request(`/rooms/${roomId}/attempt`, authHeaders, {
    method: 'POST',
    body: JSON.stringify({ answer }),
  })
  return attemptResponseSchema.parse(await response.json())
}

/** Takes the next hint. Costs one, recorded against the game. */
export async function takeHint(
  roomId: RoomId,
  authHeaders: Record<string, string>,
): Promise<HintResponse> {
  const response = await request(`/rooms/${roomId}/hint`, authHeaders, { method: 'POST' })
  return hintResponseSchema.parse(await response.json())
}
