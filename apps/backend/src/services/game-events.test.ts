import { describe, expect, it } from 'vitest'
import request from 'supertest'
import type { Server } from 'node:http'
import { MAX_GAME_EVENTS, MAX_LOGGED_ANSWER_LENGTH, type GameEvent } from '@escape-room/shared'
import { createTestApp as createApp } from '../test/server.js'
import { createTestAuthenticator, TEST_USER_HEADER } from '../http/test-authenticator.js'
import { SOLUTIONS } from '../domain/rooms/solutions.fixture.js'

const USER = 'user_alice'

function buildApp(attemptRateLimit = 10_000): Server {
  return createApp({ authenticator: createTestAuthenticator(), attemptRateLimit })
}

function as(app: Server) {
  return {
    get: (path: string) => request(app).get(path).set(TEST_USER_HEADER, USER),
    post: (path: string) => request(app).post(path).set(TEST_USER_HEADER, USER),
  }
}

async function start(app: Server) {
  await as(app).post('/api/sessions').send({})
}

async function events(app: Server): Promise<GameEvent[]> {
  const response = await as(app).get('/api/sessions/me')
  return response.body.session.events
}

function typesOf(log: GameEvent[]): string[] {
  return log.map((event) => event.type)
}

describe('activity log', () => {
  it('records the game starting', async () => {
    const app = buildApp()
    await start(app)

    const log = await events(app)
    expect(typesOf(log)).toEqual(['game_started'])
    expect(log[0]?.at).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('records entering a room, but only the first time', async () => {
    const app = buildApp()
    await start(app)

    await as(app).get('/api/rooms/room-01')
    await as(app).get('/api/rooms/room-01')
    await as(app).get('/api/rooms/room-01')

    const entered = (await events(app)).filter((event) => event.type === 'room_entered')
    expect(entered).toHaveLength(1)
    expect(entered[0]?.roomId).toBe('room-01')
  })

  it('does not record entering a room the player was refused', async () => {
    const app = buildApp()
    await start(app)

    await as(app).get('/api/rooms/room-02').expect(403)

    const entered = (await events(app)).filter((event) => event.type === 'room_entered')
    expect(entered).toHaveLength(0)
  })

  it('records wrong answers, which is where the useful signal is', async () => {
    const app = buildApp()
    await start(app)

    await as(app).post('/api/rooms/room-01/attempt').send({ answer: 'nope' })
    await as(app).post('/api/rooms/room-01/attempt').send({ answer: 'also nope' })

    const attempts = (await events(app)).filter((event) => event.type === 'attempt')
    expect(attempts).toHaveLength(2)
    expect(attempts.every((event) => event.correct === false)).toBe(true)
    expect(attempts[0]?.answer).toBe('nope')
    expect(attempts[0]?.roomId).toBe('room-01')
  })

  it('records solving a room alongside the attempt that did it', async () => {
    const app = buildApp()
    await start(app)

    await as(app).post('/api/rooms/room-01/attempt').send({ answer: SOLUTIONS['room-01'] })

    const log = await events(app)
    expect(typesOf(log)).toContain('attempt')
    expect(typesOf(log)).toContain('room_solved')
    const solved = log.find((event) => event.type === 'room_solved')
    expect(solved?.roomId).toBe('room-01')
  })

  it('records hints against the room they were taken in', async () => {
    const app = buildApp()
    await start(app)

    await as(app).post('/api/rooms/room-01/hint').send({})

    const hints = (await events(app)).filter((event) => event.type === 'hint_taken')
    expect(hints).toHaveLength(1)
    expect(hints[0]?.roomId).toBe('room-01')
  })

  it('records the game being completed, once, at the end', async () => {
    const app = buildApp()
    await start(app)

    for (const roomId of ['room-01', 'room-02'] as const) {
      await as(app).post(`/api/rooms/${roomId}/attempt`).send({ answer: SOLUTIONS[roomId] })
    }

    // room-03's five riddles are real progress but no longer finish the
    // room by themselves (ADR-0025) — only POST .../complete (ADR-0027)
    // actually marks it solved, once Atlantis and the Olympus carpet race
    // (both client-side) are cleared too.
    for (const answer of ['A', 'C', 'D', 'D', 'B']) {
      await as(app).post('/api/rooms/room-03/attempt').send({ answer })
    }
    await as(app).post('/api/rooms/room-03/complete').send({})

    await as(app).post('/api/rooms/room-04/attempt').send({ answer: SOLUTIONS['room-04'] })

    const log = await events(app)
    const completed = log.filter((event) => event.type === 'game_completed')
    expect(completed).toHaveLength(1)
    // It must be the last thing that happened.
    expect(typesOf(log).at(-1)).toBe('game_completed')
  })

  it('truncates a long answer rather than storing it whole', async () => {
    const app = buildApp()
    await start(app)

    await as(app)
      .post('/api/rooms/room-01/attempt')
      .send({ answer: 'x'.repeat(5000) })

    const attempt = (await events(app)).find((event) => event.type === 'attempt')
    expect(attempt?.answer?.length).toBe(MAX_LOGGED_ANSWER_LENGTH)
  })

  it('survives a non-string answer without throwing', async () => {
    const app = buildApp()
    await start(app)

    for (const answer of [42, true, null, { a: 1 }, ['x']]) {
      const response = await as(app).post('/api/rooms/room-01/attempt').send({ answer })
      expect(response.status).toBe(200)
    }

    const attempts = (await events(app)).filter((event) => event.type === 'attempt')
    expect(attempts).toHaveLength(5)
    expect(attempts.every((event) => typeof event.answer === 'string')).toBe(true)
  })

  it('caps the log so one player cannot grow the item without bound', async () => {
    const app = buildApp()
    await start(app)

    // Comfortably past the cap. This is the case that would otherwise push the
    // DynamoDB item past 400 KB and break the player's game permanently.
    for (let i = 0; i < MAX_GAME_EVENTS + 20; i += 1) {
      await as(app).post('/api/rooms/room-01/attempt').send({ answer: i })
    }

    const log = await events(app)
    expect(log.length).toBeLessThanOrEqual(MAX_GAME_EVENTS)
    // Oldest dropped first, so the beginning of the game has aged out.
    expect(typesOf(log)).not.toContain('game_started')
  })

  it('starts a fresh log after a reset', async () => {
    const app = buildApp()
    await start(app)
    await as(app).post('/api/rooms/room-01/attempt').send({ answer: SOLUTIONS['room-01'] })

    await request(app).delete('/api/sessions/me').set(TEST_USER_HEADER, USER).expect(204)
    await start(app)

    expect(typesOf(await events(app))).toEqual(['game_started'])
  })
})
