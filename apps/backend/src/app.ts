import express, { type Express } from 'express'
import cors from 'cors'
import helmet from 'helmet'
import { clerkMiddleware } from '@clerk/express'
import { config } from './config.js'
import {
  DynamoGameRepository,
  InMemoryGameRepository,
  type GameRepository,
} from './repositories/game.repository.js'
import { GameService } from './services/game.service.js'
import { RoomService } from './services/room.service.js'
import { createClerkAuthenticator, type Authenticator } from './http/authenticator.js'
import { createHealthRoutes } from './routes/health.routes.js'
import { createSessionRoutes } from './routes/sessions.routes.js'
import { createRoomRoutes } from './routes/rooms.routes.js'
import { createAttemptRateLimiter } from './http/rate-limit.js'
import { createOriginGuard } from './http/origin-guard.js'
import { errorHandler, notFoundHandler } from './http/error-handler.js'

export interface AppOptions {
  /** Injected by tests so each test gets an isolated store. */
  gameRepository?: GameRepository
  /** Injected by tests so the suite needs no Clerk key and makes no network calls. */
  authenticator?: Authenticator
  /** Attempts per IP per minute. Tests lower it to assert the limiter fires. */
  attemptRateLimit?: number
  /** Shared secret CloudFront must present. Empty disables the check. */
  originSecret?: string
}

/**
 * Builds the API.
 *
 * A factory rather than a module-level app so tests can construct a fresh,
 * isolated instance per case instead of sharing global state.
 */
export function createApp(options: AppOptions = {}): Express {
  // DynamoDB when a table is configured, in memory otherwise — which is what
  // lets `docker compose up` and the test suite run with no AWS credentials.
  const repository =
    options.gameRepository ??
    (config.gamesTableName
      ? new DynamoGameRepository(config.gamesTableName, config.awsRegion)
      : new InMemoryGameRepository())

  const usingClerk = options.authenticator === undefined
  const authenticator = options.authenticator ?? createClerkAuthenticator()

  const gameService = new GameService(repository, authenticator)
  const roomService = new RoomService(gameService)

  const app = express()

  // How many proxies to trust when reading the client IP. Wrong here means the
  // rate limiter either counts everyone as one client or can be spoofed.
  app.set('trust proxy', config.trustProxy)
  app.disable('x-powered-by')

  app.use(helmet())
  app.use(cors({ origin: config.corsOrigin }))
  // 10 kB: an answer is a word or a number. Anything larger is not a player.
  app.use(express.json({ limit: '10kb' }))

  // Health is mounted before both guards: App Runner's health check hits the
  // container directly, with neither the CloudFront secret nor a Clerk token.
  app.use('/api', createHealthRoutes())

  // Everything below is reachable only through CloudFront in production.
  app.use('/api', createOriginGuard(options.originSecret ?? config.originSecret))

  // Reads the Clerk session token and verifies it against Clerk's JWKS. Only
  // mounted for the real authenticator — tests inject a fake and would
  // otherwise need a Clerk secret key just to boot.
  if (usingClerk) {
    app.use('/api', clerkMiddleware())
  }

  app.use('/api/sessions', createSessionRoutes(gameService, authenticator))
  app.use(
    '/api/rooms',
    createRoomRoutes(
      gameService,
      roomService,
      authenticator,
      createAttemptRateLimiter(options.attemptRateLimit ?? config.attemptRateLimit),
    ),
  )

  app.use(notFoundHandler)
  app.use(errorHandler)

  return app
}
