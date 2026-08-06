import type { Request } from 'express'
import type { Authenticator } from './authenticator.js'

/**
 * Resolves who is calling, at most once per request.
 *
 * Both the rate limiter and the route handler need the caller's id, and the
 * limiter runs first. Memoising on the request keeps that to a single
 * verification rather than two.
 *
 * The result is cached even when it is null: an unauthenticated request should
 * not be re-checked by every layer that asks.
 */
const CACHE = Symbol('identifiedUserId')

interface Cached {
  [CACHE]?: Promise<string | null>
}

export function identifyOnce(req: Request, authenticator: Authenticator): Promise<string | null> {
  const holder = req as Request & Cached
  holder[CACHE] ??= authenticator.identify(req)
  return holder[CACHE]
}
