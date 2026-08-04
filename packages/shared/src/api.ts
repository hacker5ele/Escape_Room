import { z } from 'zod'
import { roomPublicDataSchema, roomSummarySchema } from './rooms.js'
import { gameSessionSchema } from './session.js'

/**
 * Every request and response the API speaks.
 *
 * The schemas are the contract and the TypeScript types are inferred from
 * them, so the runtime validation and the compile-time type are the same
 * declaration and cannot drift apart.
 *
 * Changing anything in this file is an interface change: ADR and team
 * agreement first. See ADR-0005.
 *
 * There is deliberately no session header. Identity comes from the Clerk
 * bearer token, and the server looks up the caller's game from it — so there
 * is no identifier in flight for anyone to steal or forge. See ADR-0019.
 */

// --- Sessions -------------------------------------------------------------

/**
 * `POST /api/sessions` — starts the caller's game, or returns it if they
 * already have one. Idempotent, so two browser tabs cannot race each other
 * into two different games. Takes no body: the player's name comes from their
 * Clerk profile.
 *
 * `GET /api/sessions/me` returns the same shape.
 */
export const sessionResponseSchema = z.object({ session: gameSessionSchema })
export type SessionResponse = z.infer<typeof sessionResponseSchema>

// --- GET /api/rooms -------------------------------------------------------

export const roomsResponseSchema = z.object({ rooms: z.array(roomSummarySchema) })
export type RoomsResponse = z.infer<typeof roomsResponseSchema>

// --- GET /api/rooms/:roomId ----------------------------------------------

export const roomResponseSchema = z.object({ room: roomPublicDataSchema })
export type RoomResponse = z.infer<typeof roomResponseSchema>

// --- POST /api/rooms/:roomId/attempt -------------------------------------

/**
 * `answer` is `unknown` on purpose: a room may ask for a word, a number, or a
 * list of positions, and each room narrows it in its own `check()`. The body
 * size limit is what keeps this safe.
 */
export const attemptRequestSchema = z.object({ answer: z.unknown() })
export type AttemptRequest = z.infer<typeof attemptRequestSchema>

export const attemptResponseSchema = z.object({
  correct: z.boolean(),
  /** Optional nudge shown to the player, e.g. "close — check the order". */
  feedback: z.string().optional(),
  session: gameSessionSchema,
})
export type AttemptResponse = z.infer<typeof attemptResponseSchema>

// --- POST /api/rooms/:roomId/hint ----------------------------------------

export const hintResponseSchema = z.object({
  hint: z.string(),
  hintsUsed: z.number().int().nonnegative(),
  hintsRemaining: z.number().int().nonnegative(),
})
export type HintResponse = z.infer<typeof hintResponseSchema>

// --- Errors ---------------------------------------------------------------

export const API_ERROR_CODES = [
  'UNAUTHENTICATED',
  /**
   * Signed in, but the Clerk profile is missing something the game needs —
   * today a username. The frontend responds by collecting it; the server
   * refuses to create a game without it, so bypassing the form achieves
   * nothing.
   */
  'PROFILE_INCOMPLETE',
  'VALIDATION_ERROR',
  'SESSION_NOT_FOUND',
  'PROFILE_NOT_FOUND',
  /** The invite link is unknown, revoked or expired — all reported identically. */
  'INVITE_INVALID',
  'ALREADY_FRIENDS',
  'CANNOT_FRIEND_SELF',
  'NOT_FRIENDS',
  'BLOCKED',
  'ROOM_NOT_FOUND',
  'ROOM_LOCKED',
  'ROOM_ALREADY_SOLVED',
  'NO_HINTS_LEFT',
  'RATE_LIMITED',
  'INTERNAL_ERROR',
] as const

export type ApiErrorCode = (typeof API_ERROR_CODES)[number]

/** Every non-2xx response has this shape. */
export const apiErrorResponseSchema = z.object({
  error: z.object({
    code: z.enum(API_ERROR_CODES),
    message: z.string(),
  }),
})
export type ApiErrorResponse = z.infer<typeof apiErrorResponseSchema>
