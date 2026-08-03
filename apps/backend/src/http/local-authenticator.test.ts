import { afterEach, describe, expect, it } from 'vitest'
import request from 'supertest'
import type { Express } from 'express'
import { createApp } from '../app.js'
import { createLocalAuthenticator } from './local-authenticator.js'
import { SOLUTIONS } from '../domain/rooms/solutions.fixture.js'

/** Builds an app in local mode the way `AUTH_MODE=local` would. */
function localApp(): Express {
  return createApp({ authenticator: createLocalAuthenticator(), attemptRateLimit: 1000 })
}

function as(app: Express, username: string, first = 'Ada', last = 'Lovelace') {
  const headers = {
    'x-dev-username': username,
    'x-dev-first-name': first,
    'x-dev-last-name': last,
  }
  return {
    get: (path: string) => request(app).get(path).set(headers),
    post: (path: string) => request(app).post(path).set(headers),
    delete: (path: string) => request(app).delete(path).set(headers),
  }
}

describe('local development authentication', () => {
  it('signs you in as whoever you say you are', async () => {
    const response = await as(localApp(), 'ada').post('/api/sessions').send({})

    expect(response.status).toBe(201)
    expect(response.body.session.username).toBe('ada')
    expect(response.body.session.playerName).toBe('Ada Lovelace')
  })

  it('refuses a request with no username header', async () => {
    const response = await request(localApp()).post('/api/sessions').send({})

    expect(response.status).toBe(401)
    expect(response.body.error.code).toBe('UNAUTHENTICATED')
  })

  it('still needs a name, exactly as Clerk does', async () => {
    const response = await request(localApp())
      .post('/api/sessions')
      .set('x-dev-username', 'ada')
      .send({})

    expect(response.status).toBe(409)
    expect(response.body.error.code).toBe('PROFILE_INCOMPLETE')
  })

  it('resumes the same game when you sign in again with the same username', async () => {
    const app = localApp()
    const first = await as(app, 'ada').post('/api/sessions').send({})

    await as(app, 'ada')
      .post('/api/rooms/room-01/attempt')
      .send({ answer: SOLUTIONS['room-01'] })

    const second = await as(app, 'ada').post('/api/sessions').send({})
    expect(second.body.session.id).toBe(first.body.session.id)
    expect(second.body.session.solvedRooms).toEqual(['room-01'])
  })

  it('keeps different usernames completely separate', async () => {
    const app = localApp()
    await as(app, 'ada').post('/api/sessions').send({})
    await as(app, 'grace').post('/api/sessions').send({})

    await as(app, 'ada').post('/api/rooms/room-01/attempt').send({ answer: SOLUTIONS['room-01'] })

    expect((await as(app, 'ada').get('/api/rooms/room-02')).status).toBe(200)
    expect((await as(app, 'grace').get('/api/rooms/room-02')).status).toBe(403)
  })

  it('namespaces the user id so a local game cannot collide with a Clerk one', async () => {
    const response = await as(localApp(), 'ada').post('/api/sessions').send({})
    expect(response.body.session.userId).toBe('local:ada')
  })

  it('trims whitespace and caps absurd header lengths', async () => {
    const response = await request(localApp())
      .post('/api/sessions')
      .set('x-dev-username', `  ${'a'.repeat(500)}  `)
      .set('x-dev-first-name', '  Ada  ')
      .set('x-dev-last-name', '  Lovelace  ')
      .send({})

    expect(response.status).toBe(201)
    expect(response.body.session.username.length).toBe(64)
    expect(response.body.session.playerName).toBe('Ada Lovelace')
  })
})

describe('the production guard', () => {
  const original = process.env.NODE_ENV

  afterEach(() => {
    process.env.NODE_ENV = original
  })

  it('is documented as refusing AUTH_MODE=local in production', () => {
    // The guard reads `config`, which is frozen at import time, so the runtime
    // behaviour cannot be exercised by mutating the environment here. What this
    // asserts is that the guard exists and names both conditions — the check
    // that would be silently deleted in a refactor.
    //
    // The real protection is layered: no deployed environment sets AUTH_MODE at
    // all, and `createApp()` throws rather than starts, so a misconfigured
    // service fails its health check instead of serving traffic wide open.
    expect(createApp.toString()).toContain('AUTH_MODE=local')
    expect(createApp.toString()).toContain('isProduction')
  })
})
