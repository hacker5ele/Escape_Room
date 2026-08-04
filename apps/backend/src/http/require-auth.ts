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

/**
 * The caller, and the game they are in.
 *
 * Since co-op that game may belong to somebody else, so the caller's own id is
 * returned alongside it — `game.userId` is the *host*, not necessarily whoever
 * is playing right now, and anything that attributes an action needs to know
 * the difference.
 */
export async function requirePlayer(
  req: Request,
  authenticator: Authenticator,
  games: GameService,
): Promise<{ userId: string; game: GameSession }> {
  const userId = await requireUserId(req, authenticator)
  const game = await games.find(userId)
  if (!game) {
    throw ApiError.sessionNotFound()
  }
  return { userId, game }
}
