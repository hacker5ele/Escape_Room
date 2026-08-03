import { describe, expect, it } from 'vitest'
import request from 'supertest'
import { SESSION_HEADER } from '@escape-room/shared'
import { createApp } from '../app.js'
import { ORIGIN_SECRET_HEADER } from './origin-guard.js'

const SECRET = 'a-shared-secret-only-cloudfront-knows'

function guardedApp() {
  return createApp({ originSecret: SECRET, attemptRateLimit: 1000 })
}

describe('origin guard', () => {
  it('is off when no secret is configured, so local dev is unaffected', async () => {
    const response = await request(createApp())
      .post('/api/sessions')
      .send({ playerName: 'Local' })

    expect(response.status).toBe(201)
  })

  it('rejects a request that did not come through CloudFront', async () => {
    const response = await request(guardedApp()).post('/api/sessions').send({ playerName: 'Direct' })

    expect(response.status).toBe(403)
  })

  it('rejects a wrong secret', async () => {
    const response = await request(guardedApp())
      .post('/api/sessions')
      .set(ORIGIN_SECRET_HEADER, 'not-the-secret')
      .send({ playerName: 'Guesser' })

    expect(response.status).toBe(403)
  })

  it('allows a request carrying the secret', async () => {
    const response = await request(guardedApp())
      .post('/api/sessions')
      .set(ORIGIN_SECRET_HEADER, SECRET)
      .send({ playerName: 'ViaCloudFront' })

    expect(response.status).toBe(201)
  })

  it('leaves /api/health open, because App Runner health checks bypass CloudFront', async () => {
    const response = await request(guardedApp()).get('/api/health')

    expect(response.status).toBe(200)
    expect(response.body.status).toBe('ok')
  })

  it('guards room access too, not only session creation', async () => {
    const app = guardedApp()
    const created = await request(app)
      .post('/api/sessions')
      .set(ORIGIN_SECRET_HEADER, SECRET)
      .send({ playerName: 'ViaCloudFront' })

    const sessionId = created.body.session.id as string

    const blocked = await request(app).get('/api/rooms/room-01').set(SESSION_HEADER, sessionId)
    expect(blocked.status).toBe(403)

    const allowed = await request(app)
      .get('/api/rooms/room-01')
      .set(ORIGIN_SECRET_HEADER, SECRET)
      .set(SESSION_HEADER, sessionId)
    expect(allowed.status).toBe(200)
  })
})
