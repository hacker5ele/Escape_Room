import { describe, expect, it } from 'vitest'
import request from 'supertest'
import type { Express } from 'express'
import { createApp } from './app.js'
import { createTestAuthenticator, TEST_USER_HEADER } from './http/test-authenticator.js'
import { SOLUTIONS } from './domain/rooms/solutions.fixture.js'

const ALICE = 'user_alice'
const BOB = 'user_bob'

/** A fresh app per test: `createApp` builds its own store, so games never leak between cases. */
function buildApp(attemptRateLimit = 1000): Express {
  return createApp({ authenticator: createTestAuthenticator(), attemptRateLimit })
}

/** Signed-in request helper. */
function as(app: Express, user: string) {
  return {
    get: (path: string) => request(app).get(path).set(TEST_USER_HEADER, user),
    post: (path: string) => request(app).post(path).set(TEST_USER_HEADER, user),
    delete: (path: string) => request(app).delete(path).set(TEST_USER_HEADER, user),
  }
}

async function startGame(app: Express, user: string) {
  const response = await as(app, user).post('/api/sessions').send({})
  expect(response.status).toBe(201)
  return response.body.session
}

describe('health', () => {
  it('reports ok without authentication', async () => {
    const response = await request(buildApp()).get('/api/health')
    expect(response.status).toBe(200)
    expect(response.body.status).toBe('ok')
  })
})

describe('authentication', () => {
  it('refuses to start a game for a signed-out caller', async () => {
    const response = await request(buildApp()).post('/api/sessions').send({})
    expect(response.status).toBe(401)
    expect(response.body.error.code).toBe('UNAUTHENTICATED')
  })

  it('refuses room access to a signed-out caller', async () => {
    const response = await request(buildApp()).get('/api/rooms/room-01')
    expect(response.status).toBe(401)
  })

  it('refuses attempts from a signed-out caller', async () => {
    const response = await request(buildApp())
      .post('/api/rooms/room-01/attempt')
      .send({ answer: SOLUTIONS['room-01'] })

    expect(response.status).toBe(401)
  })
})

describe('sessions', () => {
  it('starts a game owned by the caller', async () => {
    const app = buildApp()
    const session = await startGame(app, ALICE)

    expect(session.userId).toBe(ALICE)
    expect(session.solvedRooms).toEqual([])
    expect(session.finishedAt).toBeNull()
    expect(session.playerName).toContain(ALICE)
  })

  it('is idempotent — a second start resumes the same game', async () => {
    const app = buildApp()
    const first = await startGame(app, ALICE)

    await as(app, ALICE)
      .post('/api/rooms/room-01/attempt')
      .send({ answer: SOLUTIONS['room-01'] })

    const second = await startGame(app, ALICE)
    expect(second.id).toBe(first.id)
    // Crucially, resuming must not wipe progress.
    expect(second.solvedRooms).toEqual(['room-01'])
  })

  it('returns the caller its own game', async () => {
    const app = buildApp()
    await startGame(app, ALICE)

    const response = await as(app, ALICE).get('/api/sessions/me')
    expect(response.status).toBe(200)
    expect(response.body.session.userId).toBe(ALICE)
  })

  it('404s when the caller has not started a game', async () => {
    const response = await as(buildApp(), ALICE).get('/api/sessions/me')
    expect(response.status).toBe(404)
    expect(response.body.error.code).toBe('SESSION_NOT_FOUND')
  })

  it('can be reset to replay from the first room', async () => {
    const app = buildApp()
    await startGame(app, ALICE)
    await as(app, ALICE)
      .post('/api/rooms/room-01/attempt')
      .send({ answer: SOLUTIONS['room-01'] })

    expect((await as(app, ALICE).delete('/api/sessions/me')).status).toBe(204)
    expect((await as(app, ALICE).get('/api/sessions/me')).status).toBe(404)

    const fresh = await startGame(app, ALICE)
    expect(fresh.solvedRooms).toEqual([])
  })
})

describe('isolation between accounts', () => {
  it('gives each account its own game', async () => {
    const app = buildApp()
    const alice = await startGame(app, ALICE)
    const bob = await startGame(app, BOB)

    expect(alice.id).not.toBe(bob.id)
    expect(bob.userId).toBe(BOB)
  })

  it("one account's progress does not unlock rooms for another", async () => {
    const app = buildApp()
    await startGame(app, ALICE)
    await startGame(app, BOB)

    // Alice solves room 1.
    const solved = await as(app, ALICE)
      .post('/api/rooms/room-01/attempt')
      .send({ answer: SOLUTIONS['room-01'] })
    expect(solved.body.correct).toBe(true)
    expect((await as(app, ALICE).get('/api/rooms/room-02')).status).toBe(200)

    // Bob is untouched by that.
    expect((await as(app, BOB).get('/api/rooms/room-02')).status).toBe(403)
    expect((await as(app, BOB).get('/api/sessions/me')).body.session.solvedRooms).toEqual([])
  })

  it('resetting one account does not touch another', async () => {
    const app = buildApp()
    await startGame(app, ALICE)
    await startGame(app, BOB)
    await as(app, BOB).post('/api/rooms/room-01/attempt').send({ answer: SOLUTIONS['room-01'] })

    await as(app, ALICE).delete('/api/sessions/me')

    expect((await as(app, BOB).get('/api/sessions/me')).body.session.solvedRooms).toEqual([
      'room-01',
    ])
  })
})

describe('room access', () => {
  it('lets the player into the first room', async () => {
    const app = buildApp()
    await startGame(app, ALICE)

    const response = await as(app, ALICE).get('/api/rooms/room-01')
    expect(response.status).toBe(200)
    expect(response.body.room.id).toBe('room-01')
  })

  it('refuses a later room until the earlier one is solved', async () => {
    const app = buildApp()
    await startGame(app, ALICE)

    const response = await as(app, ALICE).get('/api/rooms/room-02')
    expect(response.status).toBe(403)
    expect(response.body.error.code).toBe('ROOM_LOCKED')
  })

  it('404s an unknown room id', async () => {
    const app = buildApp()
    await startGame(app, ALICE)

    const response = await as(app, ALICE).get('/api/rooms/room-99')
    expect(response.status).toBe(404)
    expect(response.body.error.code).toBe('ROOM_NOT_FOUND')
  })

  it('lists every room with its lock state', async () => {
    const app = buildApp()
    await startGame(app, ALICE)

    const response = await as(app, ALICE).get('/api/rooms')
    expect(response.status).toBe(200)
    expect(response.body.rooms).toHaveLength(4)
    expect(response.body.rooms[0]).toMatchObject({ id: 'room-01', unlocked: true, solved: false })
    expect(response.body.rooms[1]).toMatchObject({ id: 'room-02', unlocked: false })
    expect(response.body.rooms[0].data).toBeUndefined()
  })
})

describe('attempts', () => {
  it('rejects a wrong answer and leaves progress alone', async () => {
    const app = buildApp()
    await startGame(app, ALICE)

    const response = await as(app, ALICE)
      .post('/api/rooms/room-01/attempt')
      .send({ answer: 'definitely wrong' })

    expect(response.status).toBe(200)
    expect(response.body.correct).toBe(false)
    expect(response.body.session.solvedRooms).toEqual([])
  })

  it('accepts the right answer and unlocks the next room', async () => {
    const app = buildApp()
    await startGame(app, ALICE)

    const attempt = await as(app, ALICE)
      .post('/api/rooms/room-01/attempt')
      .send({ answer: SOLUTIONS['room-01'] })

    expect(attempt.body.correct).toBe(true)
    expect(attempt.body.session.solvedRooms).toEqual(['room-01'])
    expect((await as(app, ALICE).get('/api/rooms/room-02')).status).toBe(200)
  })

  it('refuses an attempt on a locked room', async () => {
    const app = buildApp()
    await startGame(app, ALICE)

    const response = await as(app, ALICE)
      .post('/api/rooms/room-03/attempt')
      .send({ answer: SOLUTIONS['room-03'] })

    expect(response.status).toBe(403)
    expect(response.body.error.code).toBe('ROOM_LOCKED')
  })

  it('solving every room finishes the game', async () => {
    const app = buildApp()
    await startGame(app, ALICE)

    let body: { session: { solvedRooms: string[]; finishedAt: string | null } } | undefined

    for (const roomId of ['room-01', 'room-02', 'room-03', 'room-04'] as const) {
      const response = await as(app, ALICE)
        .post(`/api/rooms/${roomId}/attempt`)
        .send({ answer: SOLUTIONS[roomId] })

      expect(response.status, `${roomId} should accept its solution`).toBe(200)
      expect(response.body.correct, `${roomId} should be solved`).toBe(true)
      body = response.body
    }

    expect(body?.session.solvedRooms).toHaveLength(4)
    expect(body?.session.finishedAt).not.toBeNull()
  })

  it('rate-limits repeated attempts so answers cannot be brute-forced', async () => {
    const app = buildApp(2)
    await startGame(app, ALICE)

    const attempt = () =>
      as(app, ALICE).post('/api/rooms/room-01/attempt').send({ answer: 1 })

    expect((await attempt()).status).toBe(200)
    expect((await attempt()).status).toBe(200)

    const blocked = await attempt()
    expect(blocked.status).toBe(429)
    expect(blocked.body.error.code).toBe('RATE_LIMITED')
  })
})

describe('hints', () => {
  it('hands out hints one at a time and counts them', async () => {
    const app = buildApp()
    await startGame(app, ALICE)

    const first = await as(app, ALICE).post('/api/rooms/room-01/hint').send({})
    expect(first.status).toBe(200)
    expect(first.body.hint).toBeTruthy()
    expect(first.body.hintsUsed).toBe(1)

    const second = await as(app, ALICE).post('/api/rooms/room-01/hint').send({})
    expect(second.body.hintsUsed).toBe(2)
    expect(second.body.hint).not.toBe(first.body.hint)
  })

  it('refuses hints for a locked room', async () => {
    const app = buildApp()
    await startGame(app, ALICE)

    const response = await as(app, ALICE).post('/api/rooms/room-02/hint').send({})
    expect(response.status).toBe(403)
  })
})
