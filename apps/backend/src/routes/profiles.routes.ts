import { Router, type RequestHandler } from 'express'
import type { PublicProfile } from '@escape-room/shared'
import type { ProfileService } from '../services/profile.service.js'
import type { Authenticator } from '../http/authenticator.js'
import { requireUserId } from '../http/require-auth.js'
import { ApiError } from '../http/api-error.js'

export function createProfileRoutes(
  profiles: ProfileService,
  authenticator: Authenticator,
  lookupRateLimiter: RequestHandler,
): Router {
  const router = Router()

  // GET /api/profiles/me — who the caller is, as everyone else sees them.
  router.get('/me', async (req, res) => {
    const userId = await requireUserId(req, authenticator)
    const profile = await profiles.findByUserId(userId)
    if (!profile) throw ApiError.profileIncomplete()

    const body: { profile: PublicProfile } = { profile }
    res.json(body)
  })

  // GET /api/profiles/by-username/:username — the lookup behind "add a friend".
  //
  // Rate limited because it is an enumeration endpoint by nature: it answers
  // "does this username exist" for anyone who asks. Signing in is required, so
  // at least the asking is attributable.
  router.get('/by-username/:username', lookupRateLimiter, async (req, res) => {
    await requireUserId(req, authenticator)

    const raw: unknown = req.params.username
    const username = typeof raw === 'string' ? raw : ''
    const profile = await profiles.findByUsername(username)
    if (!profile) {
      throw new ApiError(404, 'PROFILE_NOT_FOUND', `Nobody here is called "${username}".`)
    }

    const body: { profile: PublicProfile } = { profile }
    res.json(body)
  })

  return router
}
