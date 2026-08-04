import { describe, expect, it } from 'vitest'
import request from 'supertest'
import type { Express } from 'express'
import type { GameSession } from '@escape-room/shared'
import { createApp } from '../app.js'
import { InMemoryGameRepository } from '../repositories/game.repository.js'
import { createTestAuthenticator, TEST_USER_HEADER } from '../http/test-authenticator.js'
import { SOLUTIONS } from '../domain/rooms/solutions.fixture.js'

const ALICE = 'user_alice'
const BOB = 'user_bob'
const MALLORY = 'user_mallory'

function buildApp(gameRepository = new InMemoryGameRepository()) {
  const app = createApp({
    authenticator: createTestAuthenticator(),
    attemptRateLimit: 1000,
    gameRepository,
  })
  return { app, gameRepository }
}

function as(app: Express, user: string) {
  return {
    get: (path: string) => request(app).get(path).set(TEST_USER_HEADER, user),
    post: (path: string) => request(app).post(path).set(TEST_USER_HEADER, user),
    delete: (path: string) => request(app).delete(path).set(TEST_USER_HEADER, user),
  }
}

async function signIn(app: Express, ...users: string[]) {
  for (const user of users) await as(app, user).post('/api/sessions').send({})
}

const usernameOf = (user: string) => `handle_${user}`

async function befriend(app: Express, a: string, b: string) {
  await as(app, a).post('/api/friends/by-username').send({ username: usernameOf(b) })
  await as(app, b).post(`/api/friends/${a}/accept`)
}

const gameOf = async (app: Express, user: string): Promise<GameSession> =>
  (await as(app, user).get('/api/sessions/me')).body.session as GameSession

const solveFirstRoom = (app: Express, user: string) =>
  as(app, user).post('/api/rooms/room-01/attempt').send({ answer: SOLUTIONS['room-01'] })

describe('joining a friend’s game', () => {
  it('starts as a party of one', async () => {
    const { app } = buildApp()
    await signIn(app, ALICE)

    const { party } = (await as(app, ALICE).get('/api/party')).body
    expect(party.host.userId).toBe(ALICE)
    expect(party.members).toEqual([])
    expect(party.isHost).toBe(true)
  })

  it('puts both players in the same game', async () => {
    const { app } = buildApp()
    await signIn(app, ALICE, BOB)
    await befriend(app, ALICE, BOB)

    const joined = await as(app, BOB).post(`/api/party/join/${ALICE}`)
    expect(joined.status).toBe(201)

    // Bob is now playing Alice's game, so both requests resolve to the same id.
    expect((await gameOf(app, BOB)).id).toBe((await gameOf(app, ALICE)).id)
  })

  it('lets either player solve, and both see it', async () => {
    const { app } = buildApp()
    await signIn(app, ALICE, BOB)
    await befriend(app, ALICE, BOB)
    await as(app, BOB).post(`/api/party/join/${ALICE}`)

    await solveFirstRoom(app, BOB)

    expect((await gameOf(app, ALICE)).solvedRooms).toContain('room-01')
    expect((await gameOf(app, BOB)).solvedRooms).toContain('room-01')
  })

  it('shows the host who has joined', async () => {
    const { app } = buildApp()
    await signIn(app, ALICE, BOB)
    await befriend(app, ALICE, BOB)
    await as(app, BOB).post(`/api/party/join/${ALICE}`)

    const { party } = (await as(app, ALICE).get('/api/party')).body
    expect(party.isHost).toBe(true)
    expect(party.members.map((m: { userId: string }) => m.userId)).toEqual([BOB])
  })

  it('tells the guest they are not the host', async () => {
    const { app } = buildApp()
    await signIn(app, ALICE, BOB)
    await befriend(app, ALICE, BOB)
    await as(app, BOB).post(`/api/party/join/${ALICE}`)

    expect((await as(app, BOB).get('/api/party')).body.party.isHost).toBe(false)
  })
})

describe('who may join', () => {
  it('refuses somebody who is not a friend', async () => {
    const { app } = buildApp()
    await signIn(app, ALICE, MALLORY)

    const response = await as(app, MALLORY).post(`/api/party/join/${ALICE}`)
    expect(response.status).toBe(403)
    expect(response.body.error.code).toBe('NOT_FRIENDS')
  })

  it('refuses a friend who has not started a game', async () => {
    const { app } = buildApp()
    // Bob signs in (so profiles exist) but Alice never opens a game.
    await signIn(app, BOB)
    await as(app, ALICE).post('/api/sessions').send({})
    await befriend(app, ALICE, BOB)
    await as(app, ALICE).delete('/api/sessions/me')

    expect((await as(app, BOB).post(`/api/party/join/${ALICE}`)).status).toBe(404)
  })

  it('refuses to chain parties', async () => {
    const { app } = buildApp()
    await signIn(app, ALICE, BOB, MALLORY)
    await befriend(app, ALICE, BOB)
    await befriend(app, BOB, MALLORY)
    await as(app, BOB).post(`/api/party/join/${ALICE}`)

    // Joining somebody who has themselves joined would make "whose game is
    // this?" a graph walk instead of one lookup.
    const response = await as(app, MALLORY).post(`/api/party/join/${BOB}`)
    expect(response.status).toBe(409)
    expect(response.body.error.code).toBe('NOT_HOST')
  })

  it('refuses to join yourself', async () => {
    const { app } = buildApp()
    await signIn(app, ALICE)
    expect((await as(app, ALICE).post(`/api/party/join/${ALICE}`)).status).toBe(400)
  })

  it('needs an account', async () => {
    const { app } = buildApp()
    expect((await request(app).get('/api/party')).status).toBe(401)
    expect((await request(app).post(`/api/party/join/${ALICE}`)).status).toBe(401)
  })
})

describe('leaving', () => {
  it('puts the guest back into their own game, untouched', async () => {
    const { app } = buildApp()
    await signIn(app, ALICE, BOB)
    await befriend(app, ALICE, BOB)

    // Bob makes progress on his own first.
    await solveFirstRoom(app, BOB)
    const ownGameId = (await gameOf(app, BOB)).id

    await as(app, BOB).post(`/api/party/join/${ALICE}`)
    expect((await gameOf(app, BOB)).id).toBe((await gameOf(app, ALICE)).id)

    await as(app, BOB).delete('/api/party')

    // His own game was never merged or deleted — it was just set aside.
    const back = await gameOf(app, BOB)
    expect(back.id).toBe(ownGameId)
    expect(back.solvedRooms).toContain('room-01')
  })

  it('lets the host send somebody home', async () => {
    const { app } = buildApp()
    await signIn(app, ALICE, BOB)
    await befriend(app, ALICE, BOB)
    await as(app, BOB).post(`/api/party/join/${ALICE}`)

    const response = await as(app, ALICE).delete(`/api/party/members/${BOB}`)
    expect(response.status).toBe(200)
    expect(response.body.party.members).toEqual([])
    expect((await gameOf(app, BOB)).userId).toBe(BOB)
  })

  it('does not let somebody evict a player from a party they do not host', async () => {
    const { app } = buildApp()
    await signIn(app, ALICE, BOB, MALLORY)
    await befriend(app, ALICE, BOB)
    await as(app, BOB).post(`/api/party/join/${ALICE}`)

    expect((await as(app, MALLORY).delete(`/api/party/members/${BOB}`)).status).toBe(404)
    // Bob is still in Alice's game.
    expect((await gameOf(app, BOB)).userId).toBe(ALICE)
  })

  it('resetting leaves the party rather than wiping the host’s progress', async () => {
    const { app } = buildApp()
    await signIn(app, ALICE, BOB)
    await befriend(app, ALICE, BOB)
    await solveFirstRoom(app, ALICE)
    await as(app, BOB).post(`/api/party/join/${ALICE}`)

    await as(app, BOB).delete('/api/sessions/me')

    // Alice's game is untouched — a guest cannot delete the game everybody
    // else is playing.
    expect((await gameOf(app, ALICE)).solvedRooms).toContain('room-01')
  })

  it('falls back to a fresh game if the host’s disappeared', async () => {
    const { app } = buildApp()
    await signIn(app, ALICE, BOB)
    await befriend(app, ALICE, BOB)
    await as(app, BOB).post(`/api/party/join/${ALICE}`)

    await as(app, ALICE).delete('/api/sessions/me')

    // Nothing to point at any more; Bob gets his own game rather than an error
    // he cannot act on.
    const resumed = await as(app, BOB).post('/api/sessions').send({})
    expect(resumed.status).toBe(201)
    expect((resumed.body.session as GameSession).userId).toBe(BOB)
  })
})

describe('two people playing at once', () => {
  it('does not lose an update when both act at the same moment', async () => {
    const { app } = buildApp()
    await signIn(app, ALICE, BOB)
    await befriend(app, ALICE, BOB)
    await as(app, BOB).post(`/api/party/join/${ALICE}`)

    // Both read the same game, both write. Without the version check the
    // second write would silently discard the first — the bug that never shows
    // up in testing and always shows up in a demo.
    await Promise.all([
      as(app, ALICE).post('/api/rooms/room-01/hint'),
      as(app, BOB).post('/api/rooms/room-01/hint'),
    ])

    expect((await gameOf(app, ALICE)).hintsUsed).toBe(2)
  })

  it('keeps both players’ events', async () => {
    const { app } = buildApp()
    await signIn(app, ALICE, BOB)
    await befriend(app, ALICE, BOB)
    await as(app, BOB).post(`/api/party/join/${ALICE}`)

    await Promise.all([
      as(app, ALICE).post('/api/rooms/room-01/attempt').send({ answer: 'wrong-from-alice' }),
      as(app, BOB).post('/api/rooms/room-01/attempt').send({ answer: 'wrong-from-bob' }),
    ])

    const answers = (await gameOf(app, ALICE)).events
      .filter((event) => event.type === 'attempt')
      .map((event) => event.answer)

    expect(answers).toContain('wrong-from-alice')
    expect(answers).toContain('wrong-from-bob')
  })

  it('bumps the version on every write', async () => {
    const { app } = buildApp()
    await signIn(app, ALICE)

    const before = (await gameOf(app, ALICE)).version
    await as(app, ALICE).post('/api/rooms/room-01/hint')
    expect((await gameOf(app, ALICE)).version).toBeGreaterThan(before)
  })
})

describe('attributing actions', () => {
  it('credits the guest by name in a shared game', async () => {
    const { app } = buildApp()
    await signIn(app, ALICE, BOB)
    await befriend(app, ALICE, BOB)
    await as(app, BOB).post(`/api/party/join/${ALICE}`)

    await solveFirstRoom(app, BOB)

    const solved = (await gameOf(app, ALICE)).events.find((event) => event.type === 'room_solved')
    expect(solved?.actorUserId).toBe(BOB)
    expect(solved?.actorName).toBeTruthy()
  })

  it('leaves a solo game unattributed — there is only one possible actor', async () => {
    const { app } = buildApp()
    await signIn(app, ALICE)

    await solveFirstRoom(app, ALICE)

    const solved = (await gameOf(app, ALICE)).events.find((event) => event.type === 'room_solved')
    expect(solved?.actorUserId).toBeUndefined()
  })
})

describe('inviting', () => {
  it('notifies the friend without moving them', async () => {
    const { app } = buildApp()
    await signIn(app, ALICE, BOB)
    await befriend(app, ALICE, BOB)
    await as(app, BOB).post('/api/sync/read')

    expect((await as(app, ALICE).post(`/api/party/invite/${BOB}`)).status).toBe(204)

    // Invited, not conscripted — Bob is still in his own game until he says yes.
    expect((await as(app, BOB).get('/api/sync')).body.unreadCount).toBe(1)
    expect((await gameOf(app, BOB)).userId).toBe(BOB)
  })

  it('refuses to invite a stranger', async () => {
    const { app } = buildApp()
    await signIn(app, ALICE, MALLORY)
    expect((await as(app, ALICE).post(`/api/party/invite/${MALLORY}`)).status).toBe(403)
  })

  it('refuses to invite into a game you do not host', async () => {
    const { app } = buildApp()
    await signIn(app, ALICE, BOB, MALLORY)
    await befriend(app, ALICE, BOB)
    await befriend(app, BOB, MALLORY)
    await as(app, BOB).post(`/api/party/join/${ALICE}`)

    const response = await as(app, BOB).post(`/api/party/invite/${MALLORY}`)
    expect(response.status).toBe(409)
    expect(response.body.error.code).toBe('NOT_HOST')
  })
})
