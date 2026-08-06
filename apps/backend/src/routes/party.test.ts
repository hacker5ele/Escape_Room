import { describe, expect, it } from 'vitest'
import request from 'supertest'
import type { Server } from 'node:http'
import { PRESENCE_TTL_VISIBLE_MS, type GameSession } from '@escape-room/shared'
import { createTestApp as createApp } from '../test/server.js'
import { LiveStore } from '../services/live-store.js'
import { InMemoryGameRepository } from '../repositories/game.repository.js'
import { createTestAuthenticator, TEST_USER_HEADER } from '../http/test-authenticator.js'
import { SOLUTIONS } from '../domain/rooms/solutions.fixture.js'

const ALICE = 'user_alice'
const BOB = 'user_bob'
const MALLORY = 'user_mallory'
const CAROL = 'user_carol'
const DAVE = 'user_dave'
const ERIN = 'user_erin'

function buildApp(gameRepository = new InMemoryGameRepository()) {
  const app = createApp({
    authenticator: createTestAuthenticator(),
    attemptRateLimit: 1000,
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

const gameOf = async (app: Server, user: string): Promise<GameSession> =>
  (await as(app, user).get('/api/sessions/me')).body.session as GameSession

const solveFirstRoom = (app: Server, user: string) =>
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

/**
 * The whole point of ADR-0045, exercised through the API.
 *
 * The store is aged rather than the clock moved. `vi.setSystemTime` is global
 * to the worker, so a test travelling fifteen seconds into the future can be
 * seen by whatever else is running and the failure lands somewhere unrelated —
 * which is exactly what it did.
 */
describe('closing the tab', () => {
  const alive = (app: Server, user: string, hidden = false) =>
    as(app, user).post('/api/stage/alive').send({ hidden })

  function buildPartyApp() {
    const live = new LiveStore()
    return { app: createApp({ authenticator: createTestAuthenticator(), liveStore: live }), live }
  }

  /** Long enough that a tab which last said it was visible has gone. */
  const untilGone = () => PRESENCE_TTL_VISIBLE_MS + 1_000

  it('takes you out of your friend\u2019s game, and frees the seat', async () => {
    const { app, live } = buildPartyApp()
    await signIn(app, ALICE, BOB)
    await befriend(app, ALICE, BOB)
    await as(app, BOB).post(`/api/party/join/${ALICE}`)

    expect((await as(app, ALICE).get('/api/party')).body.party.members).toHaveLength(1)

    // Bob closes his tab: nothing is sent, he simply stops beating. Alice is
    // still here, so only he ages past the timeout.
    live.rewind(untilGone())
    await alive(app, ALICE)

    expect((await as(app, ALICE).get('/api/party')).body.party.members).toEqual([])
    // And he is playing his own game again, so his solves are his own.
    expect((await as(app, BOB).get('/api/party')).body.party.isHost).toBe(true)
  })

  it('leaves a reload completely untouched', async () => {
    const { app, live } = buildPartyApp()
    await signIn(app, ALICE, BOB)
    await befriend(app, ALICE, BOB)
    await as(app, BOB).post(`/api/party/join/${ALICE}`)

    // A page takes a second or two to come back, and beats again when it does.
    live.rewind(2_000)
    await alive(app, BOB)

    expect((await as(app, BOB).get('/api/party')).body.party.isHost).toBe(false)
    expect((await as(app, ALICE).get('/api/party')).body.party.members).toHaveLength(1)
  })

  it('is patient with a tab that said it was hidden', async () => {
    const { app, live } = buildPartyApp()
    await signIn(app, ALICE, BOB)
    await befriend(app, ALICE, BOB)
    await as(app, BOB).post(`/api/party/join/${ALICE}`)

    await alive(app, BOB, true)
    live.rewind(60_000)

    expect((await as(app, ALICE).get('/api/party')).body.party.members).toHaveLength(1)
  })

  it('frees a seat so somebody else can take it', async () => {
    const { app, live } = buildPartyApp()
    await signIn(app, ALICE, BOB, CAROL, DAVE, ERIN)
    for (const guest of [BOB, CAROL, DAVE, ERIN]) await befriend(app, ALICE, guest)
    for (const guest of [BOB, CAROL, DAVE]) {
      expect((await as(app, guest).post(`/api/party/join/${ALICE}`)).status).toBe(201)
    }
    expect((await as(app, ERIN).post(`/api/party/join/${ALICE}`)).status).toBe(409)

    // All three close their tabs. The seats were held for ever before this.
    live.rewind(untilGone())

    expect((await as(app, ERIN).post(`/api/party/join/${ALICE}`)).status).toBe(201)
  })
})

/**
 * Emailing somebody who is not there to see the bell (ADR-0046).
 *
 * The gate is three questions and every one of them has a test, because each
 * failure mode is invisible: an email that does not arrive looks the same as a
 * friend who did not answer, and one that arrives twice looks like a bug in
 * somebody else's inbox.
 */
describe('inviting a friend who is not on the app', () => {
  function buildMailApp() {
    const live = new LiveStore()
    const sent: { to: string; subject: string; html: string }[] = []
    const mailer = {
      async send(mail: { to: string; subject: string; html: string }) {
        sent.push(mail)
      },
      cid: (label: string) => `${label}@test`,
    }
    const app = createApp({
      authenticator: createTestAuthenticator(),
      liveStore: live,
      mailer,
      directory: {
        async emailFor(userId: string) {
          return `${userId}@example.com`
        },
      },
    })
    return { app, live, sent }
  }

  async function beFriends(app: Server) {
    await signIn(app, ALICE, BOB)
    await befriend(app, ALICE, BOB)
  }

  it('emails them, because the bell is going to sit there unread', async () => {
    const { app, sent } = buildMailApp()
    await beFriends(app)

    expect((await as(app, ALICE).post(`/api/party/invite/${BOB}`)).status).toBe(204)

    expect(sent).toHaveLength(1)
    expect(sent[0]?.to).toBe(`${BOB}@example.com`)
    expect(sent[0]?.subject).toContain('door open')
  })

  it('does not email somebody who is looking at the app right now', async () => {
    const { app, live, sent } = buildMailApp()
    await beFriends(app)
    live.alive(BOB, false)

    await as(app, ALICE).post(`/api/party/invite/${BOB}`)

    expect(sent).toEqual([])
  })

  it('sends one email, not one per press', async () => {
    // Throttled on there already being an unread invitation from this person —
    // no new state, and it clears itself the moment they read it.
    const { app, sent } = buildMailApp()
    await beFriends(app)

    await as(app, ALICE).post(`/api/party/invite/${BOB}`)
    await as(app, ALICE).post(`/api/party/invite/${BOB}`)
    await as(app, ALICE).post(`/api/party/invite/${BOB}`)

    expect(sent).toHaveLength(1)
  })

  it('says nothing to somebody with no verified address', async () => {
    const live = new LiveStore()
    const sent: unknown[] = []
    const app = createApp({
      authenticator: createTestAuthenticator(),
      liveStore: live,
      mailer: {
        async send(m: unknown) {
          sent.push(m)
        },
        cid: () => 'x@test',
      },
      // Nobody is reachable — which is also local development, where there is
      // no identity provider holding addresses at all.
      directory: {
        async emailFor() {
          return null
        },
      },
    })
    await signIn(app, ALICE, BOB)
    await befriend(app, ALICE, BOB)

    expect((await as(app, ALICE).post(`/api/party/invite/${BOB}`)).status).toBe(204)
    expect(sent).toEqual([])
  })

  it('still invites them when the mail fails', async () => {
    // The bell notification has already been written by the time anything is
    // sent. A courtesy that did not arrive must not fail the action.
    const live = new LiveStore()
    const app = createApp({
      authenticator: createTestAuthenticator(),
      liveStore: live,
      mailer: {
        async send() {
          throw new Error('SES is having an afternoon')
        },
        cid: () => 'x@test',
      },
      directory: {
        async emailFor() {
          return 'friend@example.com'
        },
      },
    })
    await signIn(app, ALICE, BOB)
    await befriend(app, ALICE, BOB)

    expect((await as(app, ALICE).post(`/api/party/invite/${BOB}`)).status).toBe(204)
    const bell = (await as(app, BOB).get('/api/sync')).body
    expect(bell.notifications.some((n: { type: string }) => n.type === 'party_invite')).toBe(true)
  })

  it('draws the character of whoever is inviting', async () => {
    const { app, sent } = buildMailApp()
    await beFriends(app)

    // Alice is standing in the lobby as she invites, which is when the stage
    // knows what she looks like.
    await as(app, ALICE)
      .post('/api/stage/heartbeat')
      .send({
        x: 800,
        y: 800,
        facing: 1,
        walking: false,
        hidden: false,
        ready: false,
        emote: null,
        character: { head: 'head-04', body: 'body-07', arm: 'arm-11', leg: 'leg-03' },
      })

    await as(app, ALICE).post(`/api/party/invite/${BOB}`)

    expect(sent).toHaveLength(1)
    expect(sent[0]?.html).toContain('cid:character@test')
  })

  it('sends an email with no picture rather than none at all', async () => {
    // Alice never opened the stage, so nothing knows her character. The
    // invitation is still worth sending.
    const { app, sent } = buildMailApp()
    await beFriends(app)

    await as(app, ALICE).post(`/api/party/invite/${BOB}`)

    expect(sent).toHaveLength(1)
    expect(sent[0]?.html).not.toContain('cid:')
  })
})
