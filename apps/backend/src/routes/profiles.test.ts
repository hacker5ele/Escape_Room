import { describe, expect, it } from 'vitest'
import request from 'supertest'
import type { Express } from 'express'
import { createApp } from '../app.js'
import {
  createTestAuthenticator,
  TEST_USER_HEADER,
  TEST_USER_WITHOUT_USERNAME,
} from '../http/test-authenticator.js'

const ALICE = 'user_alice'
const BOB = 'user_bob'

function buildApp(): Express {
  return createApp({ authenticator: createTestAuthenticator(), attemptRateLimit: 1000 })
}

function as(app: Express, user: string) {
  return {
    get: (path: string) => request(app).get(path).set(TEST_USER_HEADER, user),
    post: (path: string) => request(app).post(path).set(TEST_USER_HEADER, user),
  }
}

/** Profiles are recorded as a side effect of opening a game. */
async function signIn(app: Express, user: string) {
  await as(app, user).post('/api/sessions').send({})
}

describe('profiles', () => {
  it('is recorded when a player opens their game', async () => {
    const app = buildApp()
    await signIn(app, ALICE)

    const response = await as(app, ALICE).get('/api/profiles/me')
    expect(response.status).toBe(200)
    expect(response.body.profile).toMatchObject({
      userId: ALICE,
      username: `handle_${ALICE}`,
      displayName: 'Test Player',
    })
  })

  it('never exposes an email address', async () => {
    const app = buildApp()
    await signIn(app, ALICE)

    const response = await as(app, ALICE).get('/api/profiles/me')
    // Anything in a profile can end up in front of another player.
    expect(JSON.stringify(response.body)).not.toMatch(/email/i)
  })

  it('is refreshed on every sign-in, not only the first', async () => {
    const app = buildApp()
    await signIn(app, ALICE)
    await signIn(app, ALICE)

    // Idempotent: signing in twice must not produce a second, conflicting
    // profile — the second write overwrites the first by key.
    const response = await as(app, ALICE).get('/api/profiles/me')
    expect(response.body.profile.userId).toBe(ALICE)
  })

  it('404s for a player who has not signed in yet', async () => {
    const response = await as(buildApp(), ALICE).get('/api/profiles/me')
    expect(response.status).toBe(409)
    expect(response.body.error.code).toBe('PROFILE_INCOMPLETE')
  })

  it('is not written for an account with no username', async () => {
    const app = buildApp()
    // This account cannot start a game, and must not appear in the directory
    // either — a nameless row in somebody's friend list helps nobody.
    await as(app, TEST_USER_WITHOUT_USERNAME).post('/api/sessions').send({})

    const response = await as(app, TEST_USER_WITHOUT_USERNAME).get('/api/profiles/me')
    expect(response.status).toBe(409)
  })
})

describe('username lookup', () => {
  it('finds another player by username', async () => {
    const app = buildApp()
    await signIn(app, ALICE)
    await signIn(app, BOB)

    const response = await as(app, ALICE).get(`/api/profiles/by-username/handle_${BOB}`)
    expect(response.status).toBe(200)
    expect(response.body.profile.userId).toBe(BOB)
  })

  it('is case-insensitive', async () => {
    const app = buildApp()
    await signIn(app, ALICE)
    await signIn(app, BOB)

    const response = await as(app, ALICE).get(
      `/api/profiles/by-username/${`handle_${BOB}`.toUpperCase()}`,
    )
    expect(response.status).toBe(200)
    expect(response.body.profile.userId).toBe(BOB)
  })

  it('404s for somebody who does not exist', async () => {
    const app = buildApp()
    await signIn(app, ALICE)

    const response = await as(app, ALICE).get('/api/profiles/by-username/nobody')
    expect(response.status).toBe(404)
    expect(response.body.error.code).toBe('PROFILE_NOT_FOUND')
  })

  it('requires signing in — the directory is not open to the world', async () => {
    const app = buildApp()
    await signIn(app, BOB)

    const response = await request(app).get(`/api/profiles/by-username/handle_${BOB}`)
    expect(response.status).toBe(401)
  })
})
