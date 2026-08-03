import type { Request } from 'express'
import { z } from 'zod'
import { roomIdSchema, SESSION_HEADER, type RoomId } from '@escape-room/shared'
import { ApiError } from './api-error.js'

const sessionIdSchema = z.uuid()

/**
 * Reads the session id from the request header.
 *
 * Validating the shape here means a malformed id is a clean 400 and never
 * reaches the repository.
 */
export function readSessionId(req: Request): string {
  const parsed = sessionIdSchema.safeParse(req.header(SESSION_HEADER))
  if (!parsed.success) {
    throw ApiError.validation(`Missing or malformed ${SESSION_HEADER} header.`)
  }
  return parsed.data
}

export function readRoomId(req: Request): RoomId {
  const raw: unknown = req.params.roomId
  const parsed = roomIdSchema.safeParse(raw)
  if (!parsed.success) {
    throw ApiError.roomNotFound(typeof raw === 'string' ? raw : 'unknown')
  }
  return parsed.data
}
