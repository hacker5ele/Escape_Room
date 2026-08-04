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

  /**
   * DynamoDB table holding one game per player. Empty selects the in-memory
   * repository instead, which is what makes `docker compose up` and the test
   * suite work without AWS credentials.
   */
  gamesTableName: process.env.GAMES_TABLE_NAME ?? '',

  /** Profile cache. Empty selects the in-memory repository, as with games. */
  profilesTableName: process.env.PROFILES_TABLE_NAME ?? '',

  friendshipsTableName: process.env.FRIENDSHIPS_TABLE_NAME ?? '',
  invitesTableName: process.env.INVITES_TABLE_NAME ?? '',
  notificationsTableName: process.env.NOTIFICATIONS_TABLE_NAME ?? '',
  messagesTableName: process.env.MESSAGES_TABLE_NAME ?? '',
  partyTableName: process.env.PARTY_TABLE_NAME ?? '',

  awsRegion: process.env.AWS_REGION ?? 'us-east-1',

  /**
   * Clerk's server-side key. Read by @clerk/express directly from the
   * environment; listed here only so a missing value is visible at start-up.
   */
  clerkSecretKey: process.env.CLERK_SECRET_KEY ?? '',

  /**
   * `clerk` (the default) or `local`.
   *
   * `local` replaces Clerk with a "type a username and you are that person"
   * identity, so the team can build rooms without keys or a network. It is
   * refused outright when NODE_ENV is production — see `createApp()`.
   */
  authMode: process.env.AUTH_MODE === 'local' ? ('local' as const) : ('clerk' as const),
} as const
