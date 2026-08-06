import rateLimit, { ipKeyGenerator, type RateLimitRequestHandler } from 'express-rate-limit'
import type { Request } from 'express'
import type { ApiErrorResponse } from '@escape-room/shared'
import type { Authenticator } from './authenticator.js'
import { identifyOnce } from './identify.js'

/**
 * A rate limiter, keyed by account where there is one and by IP otherwise.
 *
 * Generalised from the original attempt-only limiter because several routes now
 * need their own budgets, and they are not the same size: guessing a puzzle
 * answer, looking somebody up by username and sending a message are different
 * kinds of abuse with different acceptable rates.
 *
 * **Keying by IP alone was wrong for this application.** Every player is in the
 * same classroom behind the same NAT, so one public address covers the whole
 * group: a shared budget means one enthusiastic player exhausts everybody's,
 * and on Thursday — when the other team is explicitly asked to break the app
 * from that same network — the limits fire on people doing nothing wrong.
 *
 * Where a request carries a verified account, that account is the key. The
 * original argument for IP ("somebody limited per account just makes more
 * accounts") does not hold once the account is a Clerk identity with a unique
 * username: making another one is exactly the barrier Clerk already is.
 * Unauthenticated requests — the public invite preview above all — still key by
 * IP, which is the right unit there because there is nothing else to use.
 */
export function createRateLimiter(options: {
  limit: number
  windowMs?: number
  message: string
  /**
   * Supply this on any route behind sign-in. Without it the limiter falls back
   * to IP, and a classroom shares one.
   */
  authenticator?: Authenticator
}): RateLimitRequestHandler {
  const { authenticator } = options

  return rateLimit({
    windowMs: options.windowMs ?? 60_000,
    limit: options.limit,
    keyGenerator: async (req: Request): Promise<string> => {
      // `ipKeyGenerator` rather than `req.ip` directly: it normalises IPv6 into
      // a /64 prefix, so one client cannot get a fresh budget per address from
      // the enormous range a single machine is typically handed.
      const byIp = () => `ip:${ipKeyGenerator(req.ip ?? '')}`
      if (!authenticator) return byIp()

      const userId = await identifyOnce(req, authenticator)
      return userId ? `user:${userId}` : byIp()
    },
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_req, res) => {
      const body: ApiErrorResponse = {
        error: { code: 'RATE_LIMITED', message: options.message },
      }
      res.status(429).json(body)
    },
  })
}

/**
 * Caps answer attempts.
 *
 * This is not decoration. Without it, a room whose answer is a four-digit code
 * falls to a script in seconds, and on Thursday the other team is explicitly
 * asked to try.
 */
export function createAttemptRateLimiter(
  limit: number,
  authenticator?: Authenticator,
): RateLimitRequestHandler {
  return createRateLimiter({
    limit,
    authenticator,
    message: 'Too many attempts. Wait a moment and try again.',
  })
}

/**
 * Caps username lookups.
 *
 * This endpoint answers "does this person exist", so without a cap it is a
 * directory anyone can walk. Generous enough that using the app normally never
 * touches it.
 */
export function createLookupRateLimiter(
  limit = 30,
  authenticator?: Authenticator,
): RateLimitRequestHandler {
  return createRateLimiter({
    limit,
    authenticator,
    message: 'Too many lookups. Wait a moment and try again.',
  })
}
