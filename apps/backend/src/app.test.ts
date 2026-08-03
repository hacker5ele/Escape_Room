import { describe, expect, it } from 'vitest'
import request from 'supertest'
import type { Express } from 'express'
import { SESSION_HEADER } from '@escape-room/shared'
import { createApp } from './app.js'
import { SOLUTIONS } from './domain/rooms/solutions.fixture.js'

/** A fresh app per test: `createApp` builds its own store, so sessions never leak between cases. */
function buildApp(attemptRateLimit = 1000): Express {
  return createApp({ attemptRateLimit })
}

async function startGame(app: Express): Promise<string> {
  const response = await request(app).post('/api/sessions').send({ playerName: 'Tester' })
  expect(response.status).toBe(201)
  return response.body.session.id as string
}

describe('health', () => {
  it('reports ok', async () => {
    const response = await request(buildApp()).get('/api/health')
    expect(response.status).toBe(200)
    expect(response.body.status).toBe('ok')
  })

  it('returns a structured error for an unknown endpoint', async () => {
    const response = await request(buildApp()).get('/api/nope')
    expect(response.status).toBe(404)
    expect(response.body.error.code).toBeDefined()
  })
})

describe('sessions', () => {
  it('starts a game with nothing solved', async () => {
    const response = await request(buildApp()).post('/api/sessions').send({ playerName: 'Abigail' })

    expect(response.status).toBe(201)
    expect(response.body.session.playerName).toBe('Abigail')
    expect(response.body.session.solvedRooms).toEqual([])
    expect(response.body.session.finishedAt).toBeNull()
    expect(response.body.session.hintsUsed).toBe(0)
  })

  it('rejects an empty player name', async () => {
    const response = await request(buildApp()).post('/api/sessions').send({ playerName: '   ' })

    expect(response.status).toBe(400)
    expect(response.body.error.code).toBe('VALIDATION_ERROR')
  })

  it('rejects an over-long player name', async () => {
    const response = await request(buildApp())
      .post('/api/sessions')
      .send({ playerName: 'x'.repeat(200) })

    expect(response.status).toBe(400)
  })

  it('rejects a missing body', async () => {
    const response = await request(buildApp()).post('/api/sessions').send({})
    expect(response.status).toBe(400)
  })

  it('can be rehydrated by id', async () => {
    const app = buildApp()
    const sessionId = await startGame(app)

    const response = await request(app).get(`/api/sessions/${sessionId}`)
    expect(response.status).toBe(200)
    expect(response.body.session.id).toBe(sessionId)
  })

  it('404s for a session that does not exist', async () => {
    const response = await request(buildApp()).get(
      '/api/sessions/00000000-0000-4000-8000-000000000000',
    )
    expect(response.status).toBe(404)
    expect(response.body.error.code).toBe('SESSION_NOT_FOUND')
  })
})

describe('room access', () => {
  it('lets the player into the first room', async () => {
    const app = buildApp()
    const sessionId = await startGame(app)

    const response = await request(app).get('/api/rooms/room-01').set(SESSION_HEADER, sessionId)

    expect(response.status).toBe(200)
    expect(response.body.room.id).toBe('room-01')
    expect(response.body.room.prompt).toBeTruthy()
  })

  it('refuses a later room until the earlier one is solved', async () => {
    const app = buildApp()
    const sessionId = await startGame(app)

    const response = await request(app).get('/api/rooms/room-02').set(SESSION_HEADER, sessionId)

    expect(response.status).toBe(403)
    expect(response.body.error.code).toBe('ROOM_LOCKED')
  })

  it('refuses the last room to a fresh session', async () => {
    const app = buildApp()
    const sessionId = await startGame(app)

    const response = await request(app).get('/api/rooms/room-04').set(SESSION_HEADER, sessionId)
    expect(response.status).toBe(403)
  })

  it('requires a session header', async () => {
    const response = await request(buildApp()).get('/api/rooms/room-01')
    expect(response.status).toBe(400)
    expect(response.body.error.code).toBe('VALIDATION_ERROR')
  })

  it('rejects a malformed session header without touching the store', async () => {
    const response = await request(buildApp())
      .get('/api/rooms/room-01')
      .set(SESSION_HEADER, 'not-a-uuid')

    expect(response.status).toBe(400)
  })

  it('404s an unknown room id', async () => {
    const app = buildApp()
    const sessionId = await startGame(app)

    const response = await request(app).get('/api/rooms/room-99').set(SESSION_HEADER, sessionId)
    expect(response.status).toBe(404)
    expect(response.body.error.code).toBe('ROOM_NOT_FOUND')
  })

  it('lists every room with its lock state', async () => {
    const app = buildApp()
    const sessionId = await startGame(app)

    const response = await request(app).get('/api/rooms').set(SESSION_HEADER, sessionId)

    expect(response.status).toBe(200)
    expect(response.body.rooms).toHaveLength(4)
    expect(response.body.rooms[0]).toMatchObject({ id: 'room-01', unlocked: true, solved: false })
    expect(response.body.rooms[1]).toMatchObject({ id: 'room-02', unlocked: false })
    // The map must not leak puzzle content.
    expect(response.body.rooms[0].data).toBeUndefined()
  })
})

describe('attempts', () => {
  it('rejects a wrong answer and leaves progress alone', async () => {
    const app = buildApp()
    const sessionId = await startGame(app)

    const response = await request(app)
      .post('/api/rooms/room-01/attempt')
      .set(SESSION_HEADER, sessionId)
      .send({ answer: 'definitely wrong' })

    expect(response.status).toBe(200)
    expect(response.body.correct).toBe(false)
    expect(response.body.session.solvedRooms).toEqual([])
  })

  it('accepts the right answer and unlocks the next room', async () => {
    const app = buildApp()
    const sessionId = await startGame(app)

    const attempt = await request(app)
      .post('/api/rooms/room-01/attempt')
      .set(SESSION_HEADER, sessionId)
      .send({ answer: SOLUTIONS['room-01'] })

    expect(attempt.status).toBe(200)
    expect(attempt.body.correct).toBe(true)
    expect(attempt.body.session.solvedRooms).toEqual(['room-01'])

    const room02 = await request(app).get('/api/rooms/room-02').set(SESSION_HEADER, sessionId)
    expect(room02.status).toBe(200)
  })

  it('refuses an attempt on a locked room', async () => {
    const app = buildApp()
    const sessionId = await startGame(app)

    const response = await request(app)
      .post('/api/rooms/room-03/attempt')
      .set(SESSION_HEADER, sessionId)
      .send({ answer: SOLUTIONS['room-03'] })

    expect(response.status).toBe(403)
    expect(response.body.error.code).toBe('ROOM_LOCKED')
  })

  it('solving every room finishes the game', async () => {
    const app = buildApp()
    const sessionId = await startGame(app)

    let body: { correct: boolean; session: { solvedRooms: string[]; finishedAt: string | null } } = {
      correct: false,
      session: { solvedRooms: [], finishedAt: null },
    }

    for (const roomId of ['room-01', 'room-02', 'room-03', 'room-04'] as const) {
      const response = await request(app)
        .post(`/api/rooms/${roomId}/attempt`)
        .set(SESSION_HEADER, sessionId)
        .send({ answer: SOLUTIONS[roomId] })

      expect(response.status, `${roomId} should accept its solution`).toBe(200)
      expect(response.body.correct, `${roomId} should be solved`).toBe(true)
      body = response.body
    }

    expect(body.session.solvedRooms).toHaveLength(4)
    expect(body.session.finishedAt).not.toBeNull()
  })

  it('rate-limits repeated attempts so answers cannot be brute-forced', async () => {
    const app = buildApp(2)
    const sessionId = await startGame(app)

    const attempt = () =>
      request(app)
        .post('/api/rooms/room-01/attempt')
        .set(SESSION_HEADER, sessionId)
        .send({ answer: 1 })

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
    const sessionId = await startGame(app)

    const first = await request(app)
      .post('/api/rooms/room-01/hint')
      .set(SESSION_HEADER, sessionId)
      .send({})

    expect(first.status).toBe(200)
    expect(first.body.hint).toBeTruthy()
    expect(first.body.hintsUsed).toBe(1)

    const second = await request(app)
      .post('/api/rooms/room-01/hint')
      .set(SESSION_HEADER, sessionId)
      .send({})

    expect(second.body.hintsUsed).toBe(2)
    expect(second.body.hint).not.toBe(first.body.hint)
  })

  it('refuses hints for a locked room', async () => {
    const app = buildApp()
    const sessionId = await startGame(app)

    const response = await request(app)
      .post('/api/rooms/room-02/hint')
      .set(SESSION_HEADER, sessionId)
      .send({})

    expect(response.status).toBe(403)
  })
})
