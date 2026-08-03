import express, { type Express } from 'express'
import cors from 'cors'
import helmet from 'helmet'
import { config } from './config.js'
import { InMemorySessionRepository, type SessionRepository } from './repositories/session.repository.js'
import { SessionService } from './services/session.service.js'
import { RoomService } from './services/room.service.js'
import { createHealthRoutes } from './routes/health.routes.js'
import { createSessionRoutes } from './routes/sessions.routes.js'
import { createRoomRoutes } from './routes/rooms.routes.js'
import { createAttemptRateLimiter } from './http/rate-limit.js'
import { errorHandler, notFoundHandler } from './http/error-handler.js'

export interface AppOptions {
  /** Injected by tests so each test gets an isolated store. */
  sessionRepository?: SessionRepository
  /** Attempts per IP per minute. Tests lower it to assert the limiter fires. */
  attemptRateLimit?: number
}

/**
 * Builds the API.
 *
 * A factory rather than a module-level app so tests can construct a fresh,
 * isolated instance per case instead of sharing global state.
 */
export function createApp(options: AppOptions = {}): Express {
  const repository = options.sessionRepository ?? new InMemorySessionRepository()
  const sessionService = new SessionService(repository)
  const roomService = new RoomService(sessionService)

  const app = express()

  // How many proxies to trust when reading the client IP. Wrong here means the
  // rate limiter either counts everyone as one client or can be spoofed.
  app.set('trust proxy', config.trustProxy)
  app.disable('x-powered-by')

  app.use(helmet())
  app.use(cors({ origin: config.corsOrigin }))
  // 10 kB: an answer is a word or a number. Anything larger is not a player.
  app.use(express.json({ limit: '10kb' }))

  app.use('/api', createHealthRoutes())
  app.use('/api/sessions', createSessionRoutes(sessionService))
  app.use(
    '/api/rooms',
    createRoomRoutes(
      sessionService,
      roomService,
      createAttemptRateLimiter(options.attemptRateLimit ?? config.attemptRateLimit),
    ),
  )

  app.use(notFoundHandler)
  app.use(errorHandler)

  return app
}
