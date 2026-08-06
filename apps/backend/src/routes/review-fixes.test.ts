import { describe, expect, it } from 'vitest'
import request from 'supertest'
import type { Server } from 'node:http'
import type { GameSession } from '@escape-room/shared'
import { createTestApp as createApp } from '../test/server.js'
import { InMemoryGameRepository } from '../repositories/game.repository.js'
import { createTestAuthenticator, TEST_USER_HEADER } from '../http/test-authenticator.js'

/**
 * Regressions for the defects found reviewing the social-layer pull request
 * after it merged. Each of these shipped, and each is the kind that stays
 * invisible until it matters.
 */

const ALICE = 'user_alice'
const BOB = 'user_bob'
const CAROL = 'user_carol'

function buildApp(
  options: { attemptRateLimit?: number; gameRepository?: InMemoryGameRepository } = {},
) {
  const gameRepository = options.gameRepository ?? new InMemoryGameRepository()
  const app = createApp({
    authenticator: createTestAuthenticator(),
    attemptRateLimit: options.attemptRateLimit ?? 1000,
    gameRepository,
  })
  return { app, gameRepository }
}

function as(app: Server, user: string) {
  return {
    get: (path: string) => request(app).get(path).set(TEST_USER_HEADER, user),
    post: (path: string) => request(app).post(path).set(TEST_USER_HEADER, user),
    delete: (path: string) => request(app).delete(path).set(TEST_USER_HEADER, user),
  }
}

async function signIn(app: Server, ...users: string[]) {
  for (const user of users) await as(app, user).post('/api/sessions').send({})
}

const usernameOf = (user: string) => `handle_${user}`

async function befriend(app: Server, a: string, b: string) {
  await as(app, a)
    .post('/api/friends/by-username')
    .send({ username: usernameOf(b) })
  await as(app, b).post(`/api/friends/${a}/accept`)
}

describe('a game written before versions existed', () => {
  it('can still be played', async () => {
    const { app, gameRepository } = buildApp()
    await signIn(app, ALICE)

    // Exactly what is in DynamoDB for anybody who played before optimistic
    // locking shipped: no `version` attribute at all. The read defaults it to
    // zero, so a naive condition of `version = 0` is false — the attribute is
    // absent, not zero — and every write conflicts for ever.
    const stored = (await gameRepository.findByUserId(ALICE))!
    delete (stored as Partial<GameSession>).version
    gameRepository.seed(stored as GameSession)

    const response = await as(app, ALICE).post('/api/rooms/room-01/hint')
    expect(response.status).toBe(200)

    // And it is versioned from here on.
    const after = (await as(app, ALICE).get('/api/sessions/me')).body.session as GameSession
    expect(after.hintsUsed).toBe(1)
    expect(after.version).toBeGreaterThan(0)
  })
})

describe('rate limits are per account, not per address', () => {
  it('one player exhausting their budget does not lock out the person beside them', async () => {
    // The whole class sits behind one school NAT, and on Thursday the other
    // team is asked to attack the app from that same network. Keyed by IP,
    // one enthusiastic player spends everybody's budget.
    const { app } = buildApp({ attemptRateLimit: 3 })
    await signIn(app, ALICE, BOB)

    let aliceLimited = false
    for (let i = 0; i < 6; i += 1) {
      const response = await as(app, ALICE).post('/api/rooms/room-01/attempt').send({ answer: i })
      if (response.status === 429) aliceLimited = true
    }
    expect(aliceLimited).toBe(true)

    // Same socket, same address, different account.
    const bob = await as(app, BOB).post('/api/rooms/room-01/attempt').send({ answer: 1 })
    expect(bob.status).not.toBe(429)
  })

  it('still limits an account that keeps going', async () => {
    const { app } = buildApp({ attemptRateLimit: 2 })
    await signIn(app, ALICE)

    const statuses: number[] = []
    for (let i = 0; i < 5; i += 1) {
      statuses.push(
        (await as(app, ALICE).post('/api/rooms/room-01/attempt').send({ answer: i })).status,
      )
    }
    expect(statuses).toContain(429)
  })

  it('falls back to the address when there is no account to key on', async () => {
    // The public invite preview has nothing else to use, and it is the one
    // endpoint a stranger can reach.
    const { app } = buildApp()

    const statuses: number[] = []
    for (let i = 0; i < 25; i += 1) {
      statuses.push((await request(app).get(`/api/invites/nope-${i}`)).status)
    }
    expect(statuses).toContain(429)
  })
})

describe('a guest is not shown as playing with themselves', () => {
  it('lists only the other people in the party', async () => {
    const { app } = buildApp()
    await signIn(app, ALICE, BOB)
    await befriend(app, ALICE, BOB)
    await as(app, BOB).post(`/api/party/join/${ALICE}`)

    const bobSees = (await as(app, BOB).get('/api/party')).body.party
    expect(bobSees.host.userId).toBe(ALICE)
    expect(bobSees.isHost).toBe(false)
    // Bob pointed at Alice, so a query for "everybody pointing at Alice"
    // returns Bob — who is the one asking.
    expect(bobSees.members).toEqual([])
  })

  it('still shows a third player to both of the others', async () => {
    const { app } = buildApp()
    await signIn(app, ALICE, BOB, CAROL)
    await befriend(app, ALICE, BOB)
    await befriend(app, ALICE, CAROL)
    await as(app, BOB).post(`/api/party/join/${ALICE}`)
    await as(app, CAROL).post(`/api/party/join/${ALICE}`)

    const bobSees = (await as(app, BOB).get('/api/party')).body.party
    expect(bobSees.members.map((m: { userId: string }) => m.userId)).toEqual([CAROL])

    const aliceSees = (await as(app, ALICE).get('/api/party')).body.party
    expect(aliceSees.members.map((m: { userId: string }) => m.userId).sort()).toEqual(
      [BOB, CAROL].sort(),
    )
  })
})

describe('leaving people behind', () => {
  it('refuses to join somebody else’s game while people are in yours', async () => {
    const { app } = buildApp()
    await signIn(app, ALICE, BOB, CAROL)
    await befriend(app, ALICE, BOB)
    await befriend(app, ALICE, CAROL)
    await as(app, BOB).post(`/api/party/join/${ALICE}`)

    // Otherwise Bob keeps pointing at Alice's game, which Alice is no longer
    // playing — alone, and with no way to tell.
    const response = await as(app, ALICE).post(`/api/party/join/${CAROL}`)
    expect(response.status).toBe(409)
    expect(response.body.error.code).toBe('NOT_HOST')

    expect((await as(app, BOB).get('/api/party')).body.party.host.userId).toBe(ALICE)
  })

  it('allows it once the party is empty again', async () => {
    const { app } = buildApp()
    await signIn(app, ALICE, BOB, CAROL)
    await befriend(app, ALICE, BOB)
    await befriend(app, ALICE, CAROL)
    await as(app, BOB).post(`/api/party/join/${ALICE}`)

    await as(app, ALICE).delete(`/api/party/members/${BOB}`)

    expect((await as(app, ALICE).post(`/api/party/join/${CAROL}`)).status).toBe(201)
  })
})
