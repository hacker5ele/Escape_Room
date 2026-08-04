import { describe, expect, it } from 'vitest'
import request from 'supertest'
import { createTestApp as createApp } from '../test/server.js'
import { ORIGIN_SECRET_HEADER } from './origin-guard.js'
import { createTestAuthenticator, TEST_USER_HEADER } from './test-authenticator.js'

const SECRET = 'a-shared-secret-only-cloudfront-knows'
const USER = 'user_alice'

function guardedApp() {
  return createApp({
    authenticator: createTestAuthenticator(),
    originSecret: SECRET,
    attemptRateLimit: 1000,
  })
}

describe('origin guard', () => {
  it('is off when no secret is configured, so local dev is unaffected', async () => {
    const response = await request(createApp({ authenticator: createTestAuthenticator() }))
      .post('/api/sessions')
      .set(TEST_USER_HEADER, USER)
      .send({})

    expect(response.status).toBe(201)
  })

  it('rejects a request that did not come through CloudFront', async () => {
    const response = await request(guardedApp())
      .post('/api/sessions')
      .set(TEST_USER_HEADER, USER)
      .send({})

    expect(response.status).toBe(403)
  })

  it('rejects a wrong secret', async () => {
    const response = await request(guardedApp())
      .post('/api/sessions')
      .set(ORIGIN_SECRET_HEADER, 'not-the-secret')
      .set(TEST_USER_HEADER, USER)
      .send({})

    expect(response.status).toBe(403)
  })

  it('allows a request carrying the secret', async () => {
    const response = await request(guardedApp())
      .post('/api/sessions')
      .set(ORIGIN_SECRET_HEADER, SECRET)
      .set(TEST_USER_HEADER, USER)
      .send({})

    expect(response.status).toBe(201)
  })

  it('leaves /api/health open, because App Runner health checks bypass CloudFront', async () => {
    const response = await request(guardedApp()).get('/api/health')

    expect(response.status).toBe(200)
    expect(response.body.status).toBe('ok')
  })

  it('runs before authentication, so it does not leak whether a caller is valid', async () => {
    // A signed-in caller who skipped the CDN still gets 403, not 401 — the
    // origin guard is the outer gate and answers first.
    const response = await request(guardedApp())
      .get('/api/rooms/room-01')
      .set(TEST_USER_HEADER, USER)

    expect(response.status).toBe(403)
  })
})
