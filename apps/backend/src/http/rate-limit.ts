import rateLimit, { type RateLimitRequestHandler } from 'express-rate-limit'
import type { ApiErrorResponse } from '@escape-room/shared'

/**
 * A rate limiter, keyed by client IP.
 *
 * Generalised from the original attempt-only limiter because several routes now
 * need their own budgets, and they are not the same size: guessing a puzzle
 * answer, looking somebody up by username and sending a message are different
 * kinds of abuse with different acceptable rates.
 *
 * Keyed by IP rather than by account on purpose — an attacker who is limited
 * per account simply makes more accounts.
 */
export function createRateLimiter(options: {
  limit: number
  windowMs?: number
  message: string
}): RateLimitRequestHandler {
  return rateLimit({
    windowMs: options.windowMs ?? 60_000,
    limit: options.limit,
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
export function createAttemptRateLimiter(limit: number): RateLimitRequestHandler {
  return createRateLimiter({
    limit,
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
export function createLookupRateLimiter(limit = 30): RateLimitRequestHandler {
  return createRateLimiter({
    limit,
    message: 'Too many lookups. Wait a moment and try again.',
  })
}
