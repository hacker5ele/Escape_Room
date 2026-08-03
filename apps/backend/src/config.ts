function readNumber(name: string, fallback: number): number {
  const raw = process.env[name]
  if (raw === undefined || raw === '') return fallback
  const parsed = Number(raw)
  if (!Number.isFinite(parsed)) {
    throw new Error(`Environment variable ${name} must be a number, got "${raw}"`)
  }
  return parsed
}

const nodeEnv = process.env.NODE_ENV ?? 'development'

export const config = {
  nodeEnv,
  isProduction: nodeEnv === 'production',
  isTest: nodeEnv === 'test',

  port: readNumber('PORT', 3000),

  /** Where the browser is served from in development. Unused in production — nginx makes it same-origin. */
  corsOrigin: process.env.CORS_ORIGIN ?? 'http://localhost:5173',

  /**
   * How many reverse proxies sit in front of us. 0 in development so that a
   * client cannot spoof X-Forwarded-For and slip past the rate limiter; 1 in
   * the container, where nginx is the only hop.
   */
  trustProxy: readNumber('TRUST_PROXY', 0),

  /** Answer attempts allowed per IP per minute. This is the brute-force defence. */
  attemptRateLimit: readNumber('ATTEMPT_RATE_LIMIT', 30),

  /**
   * Shared secret CloudFront sends on every origin request, so the public
   * App Runner URL cannot be used to bypass the CDN. Empty means the check is
   * off, which is what we want locally, in tests and under docker compose.
   */
  originSecret: process.env.ORIGIN_SECRET ?? '',
} as const
