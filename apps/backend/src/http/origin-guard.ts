import type { RequestHandler } from 'express'
import { createHash, timingSafeEqual } from 'node:crypto'
import { ApiError } from './api-error.js'

export const ORIGIN_SECRET_HEADER = 'x-origin-secret'

/**
 * Rejects requests that did not come through our CloudFront distribution.
 *
 * App Runner gives the service a public URL, so without this the API can be
 * reached directly and everything CloudFront provides — plus any WAF rule we
 * add later — is simply skipped. CloudFront attaches this shared secret as an
 * origin custom header; nobody else knows it.
 *
 * An empty secret disables the check, which is the case locally, in tests and
 * under docker compose, where nginx is already the only way in.
 *
 * `/api/health` is mounted before this guard on purpose: App Runner's own
 * health check calls the container directly and never carries the header, so
 * guarding it would make every deployment fail.
 */
export function createOriginGuard(secret: string): RequestHandler {
  return (req, _res, next) => {
    if (secret === '') {
      next()
      return
    }

    const provided = req.header(ORIGIN_SECRET_HEADER)
    if (provided === undefined || !matches(provided, secret)) {
      // Deliberately vague: someone poking at the origin directly learns
      // nothing about why it failed.
      next(new ApiError(403, 'VALIDATION_ERROR', 'Forbidden.'))
      return
    }

    next()
  }
}

/**
 * Constant-time compare, so response timing cannot be used to guess the secret.
 *
 * Hashing both sides first is what makes it genuinely constant time.
 * `timingSafeEqual` throws on length mismatch, so comparing the raw strings
 * needs a length check in front of it — and that check returns early, which
 * leaks the secret's length through timing. Two SHA-256 digests are always 32
 * bytes, so there is no early return and nothing to measure.
 */
function matches(provided: string, expected: string): boolean {
  const providedDigest = createHash('sha256').update(provided).digest()
  const expectedDigest = createHash('sha256').update(expected).digest()
  return timingSafeEqual(providedDigest, expectedDigest)
}
