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
import {
  DynamoProfileRepository,
  InMemoryProfileRepository,
  type ProfileRepository,
} from './repositories/profile.repository.js'
import {
  DynamoFriendshipRepository,
  InMemoryFriendshipRepository,
  type FriendshipRepository,
} from './repositories/friendship.repository.js'
import {
  DynamoInviteRepository,
  InMemoryInviteRepository,
  type InviteRepository,
} from './repositories/invite.repository.js'
import {
  DynamoNotificationRepository,
  InMemoryNotificationRepository,
  type NotificationRepository,
} from './repositories/notification.repository.js'
import { GameService } from './services/game.service.js'
import { NotificationService } from './services/notification.service.js'
import { FriendService } from './services/friend.service.js'
import { InviteService } from './services/invite.service.js'
import { ProfileService } from './services/profile.service.js'
import { RoomService } from './services/room.service.js'
import { createClerkAuthenticator, type Authenticator } from './http/authenticator.js'
import { createLocalAuthenticator } from './http/local-authenticator.js'
import { createHealthRoutes } from './routes/health.routes.js'
import { createSessionRoutes } from './routes/sessions.routes.js'
import { createProfileRoutes } from './routes/profiles.routes.js'
import { createFriendRoutes, createInviteRoutes } from './routes/friends.routes.js'
import { createSyncRoutes } from './routes/sync.routes.js'
import { createRoomRoutes } from './routes/rooms.routes.js'
import {
  createAttemptRateLimiter,
  createLookupRateLimiter,
  createRateLimiter,
} from './http/rate-limit.js'
import { createOriginGuard } from './http/origin-guard.js'
import { errorHandler, notFoundHandler } from './http/error-handler.js'

export interface AppOptions {
  /** Injected by tests so each test gets an isolated store. */
  gameRepository?: GameRepository
  profileRepository?: ProfileRepository
  friendshipRepository?: FriendshipRepository
  inviteRepository?: InviteRepository
  notificationRepository?: NotificationRepository
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

  // The local authenticator lets anyone claim any identity by typing a name.
  // That is the point on a laptop and a disaster anywhere else, so refuse to
  // build at all rather than start and serve traffic. Throwing here means a
  // misconfigured deployment fails its health check and never takes traffic,
  // instead of quietly running wide open.
  if (options.authenticator === undefined && config.authMode === 'local' && config.isProduction) {
    throw new Error(
      'AUTH_MODE=local is a development-only backdoor and cannot be used with NODE_ENV=production. ' +
        'Unset AUTH_MODE to use Clerk.',
    )
  }

  const authenticator =
    options.authenticator ??
    (config.authMode === 'local' ? createLocalAuthenticator() : createClerkAuthenticator())

  // Clerk's middleware is only mounted when Clerk is actually in use: it needs
  // a secret key to construct, which local development does not have.
  const usingClerk = options.authenticator === undefined && config.authMode === 'clerk'

  const profileRepository =
    options.profileRepository ??
    (config.profilesTableName
      ? new DynamoProfileRepository(config.profilesTableName, config.awsRegion)
      : new InMemoryProfileRepository())

  const friendshipRepository =
    options.friendshipRepository ??
    (config.friendshipsTableName
      ? new DynamoFriendshipRepository(config.friendshipsTableName, config.awsRegion)
      : new InMemoryFriendshipRepository())

  const inviteRepository =
    options.inviteRepository ??
    (config.invitesTableName
      ? new DynamoInviteRepository(config.invitesTableName, config.awsRegion)
      : new InMemoryInviteRepository())

  const notificationRepository =
    options.notificationRepository ??
    (config.notificationsTableName
      ? new DynamoNotificationRepository(config.notificationsTableName, config.awsRegion)
      : new InMemoryNotificationRepository())

  const gameService = new GameService(repository)
  const profileService = new ProfileService(profileRepository)
  const notificationService = new NotificationService(notificationRepository, profileService)
  const friendService = new FriendService(friendshipRepository, profileService, notificationService)
  const inviteService = new InviteService(inviteRepository, profileService)
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

  app.use('/api/sessions', createSessionRoutes(gameService, profileService, authenticator))
  app.use(
    '/api/profiles',
    createProfileRoutes(profileService, authenticator, createLookupRateLimiter()),
  )
  // Social writes share one budget: creating links, sending requests and
  // accepting are all cheap individually and all worth capping together.
  const socialWriteLimiter = createRateLimiter({
    limit: 30,
    message: 'Slow down a moment.',
  })

  // Polled every few seconds by every open tab, so its budget is much larger
  // than the write limiter's — and still bounded, because a client stuck in a
  // retry loop should not be able to saturate the one container.
  app.use(
    '/api/sync',
    createSyncRoutes(
      notificationService,
      authenticator,
      createRateLimiter({ limit: 240, message: 'Polling too fast. Slow down.' }),
    ),
  )

  app.use('/api/friends', createFriendRoutes(friendService, profileService, authenticator, socialWriteLimiter))
  app.use(
    '/api/invites',
    createInviteRoutes(
      inviteService,
      friendService,
      authenticator,
      socialWriteLimiter,
      // The only unauthenticated endpoint that reads the database, so it gets
      // the tightest budget of anything here.
      createRateLimiter({ limit: 20, message: 'Too many requests. Wait a moment.' }),
    ),
  )
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
