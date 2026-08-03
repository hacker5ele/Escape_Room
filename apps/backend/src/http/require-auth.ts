import type { Request } from 'express'
import type { GameSession } from '@escape-room/shared'
import { ApiError } from './api-error.js'
import type { Authenticator } from './authenticator.js'
import type { GameService } from '../services/game.service.js'

/**
 * Resolves the caller, or fails the request.
 *
 * Every route that touches a game goes through here. There is no session id in
 * the request to look up, so there is also no ownership check to forget —
 * a route can only ever reach the game belonging to the verified caller.
 * See ADR-0019.
 */
export async function requireUserId(req: Request, authenticator: Authenticator): Promise<string> {
  const userId = await authenticator.identify(req)
  if (!userId) {
    throw new ApiError(401, 'UNAUTHENTICATED', 'Sign in to play.')
  }
  return userId
}

/** The caller's game, failing the request if they have not started one. */
export async function requireGame(
  req: Request,
  authenticator: Authenticator,
  games: GameService,
): Promise<GameSession> {
  const userId = await requireUserId(req, authenticator)
  const game = await games.find(userId)
  if (!game) {
    throw ApiError.sessionNotFound()
  }
  return game
}
