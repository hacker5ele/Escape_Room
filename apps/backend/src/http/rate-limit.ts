import rateLimit, { type RateLimitRequestHandler } from 'express-rate-limit'
import type { ApiErrorResponse } from '@escape-room/shared'

/**
 * Caps answer attempts per client per minute.
 *
 * This is not decoration. Without it, a room whose answer is a four-digit code
 * falls to a script in seconds, and on Thursday the other team is explicitly
 * asked to try. Keyed by IP, because a cheater would simply start a new
 * session otherwise.
 */
export function createAttemptRateLimiter(limit: number): RateLimitRequestHandler {
  return rateLimit({
    windowMs: 60_000,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_req, res) => {
      const body: ApiErrorResponse = {
        error: { code: 'RATE_LIMITED', message: 'Too many attempts. Wait a moment and try again.' },
      }
      res.status(429).json(body)
    },
  })
}
