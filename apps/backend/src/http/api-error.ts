import type { ApiErrorCode } from '@escape-room/shared'

/**
 * An error we deliberately show to the client. Anything that is not an
 * ApiError becomes a generic 500 with no detail — see `errorHandler`.
 */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ApiErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }

  static validation(message: string): ApiError {
    return new ApiError(400, 'VALIDATION_ERROR', message)
  }

  static sessionNotFound(): ApiError {
    return new ApiError(404, 'SESSION_NOT_FOUND', 'No game session with that id. Start a new game.')
  }

  static roomNotFound(roomId: string): ApiError {
    return new ApiError(404, 'ROOM_NOT_FOUND', `There is no room "${roomId}".`)
  }

  static roomLocked(): ApiError {
    return new ApiError(403, 'ROOM_LOCKED', 'Solve the previous room first.')
  }

  static roomAlreadySolved(): ApiError {
    return new ApiError(409, 'ROOM_ALREADY_SOLVED', 'You have already solved this room.')
  }

  static noHintsLeft(): ApiError {
    return new ApiError(409, 'NO_HINTS_LEFT', 'There are no more hints for this room.')
  }
}
