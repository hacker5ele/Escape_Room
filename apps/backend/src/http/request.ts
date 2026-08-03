import type { Request } from 'express'
import { roomIdSchema, type RoomId } from '@escape-room/shared'
import { ApiError } from './api-error.js'

export function readRoomId(req: Request): RoomId {
  const raw: unknown = req.params.roomId
  const parsed = roomIdSchema.safeParse(raw)
  if (!parsed.success) {
    throw ApiError.roomNotFound(typeof raw === 'string' ? raw : 'unknown')
  }
  return parsed.data
}
