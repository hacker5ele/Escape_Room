import { describe, expect, it } from 'vitest'
import request from 'supertest'
import type { Server } from 'node:http'
import { MAX_MESSAGE_LENGTH, type Message } from '@escape-room/shared'
import { createTestApp as createApp } from '../test/server.js'
import { conversationIdFor } from '../services/chat.service.js'
import { createTestAuthenticator, TEST_USER_HEADER } from '../http/test-authenticator.js'

const ALICE = 'user_alice'
const BOB = 'user_bob'
const MALLORY = 'user_mallory'

function buildApp(): Server {
  return createApp({ authenticator: createTestAuthenticator(), attemptRateLimit: 1000 })
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

/** Leaves Alice and Bob mutual friends. */
async function befriend(app: Server, a: string, b: string) {
  await as(app, a)
    .post('/api/friends/by-username')
    .send({ username: usernameOf(b) })
  await as(app, b).post(`/api/friends/${a}/accept`)
}

const send = (app: Server, from: string, to: string, body: string) =>
  as(app, from).post(`/api/chat/${to}/messages`).send({ body })

const history = (app: Server, user: string, other: string) =>
  as(app, user).get(`/api/chat/${other}/messages`)

describe('deriving the conversation id', () => {
  it('is the same from either side', () => {
    expect(conversationIdFor(ALICE, BOB)).toBe(conversationIdFor(BOB, ALICE))
  })

  it('differs per pair', () => {
    expect(conversationIdFor(ALICE, BOB)).not.toBe(conversationIdFor(ALICE, MALLORY))
  })
})

describe('sending and reading messages', () => {
  it('delivers a message to the friend', async () => {
    const app = buildApp()
    await signIn(app, ALICE, BOB)
    await befriend(app, ALICE, BOB)

    const sent = await send(app, ALICE, BOB, 'Hello Bob')
    expect(sent.status).toBe(201)
    expect(sent.body.message).toMatchObject({ authorUserId: ALICE, body: 'Hello Bob' })

    const bobSees = await history(app, BOB, ALICE)
    expect(bobSees.status).toBe(200)
    expect((bobSees.body.messages as Message[]).map((m) => m.body)).toEqual(['Hello Bob'])
  })

  it('both sides see the same conversation, oldest first', async () => {
    const app = buildApp()
    await signIn(app, ALICE, BOB)
    await befriend(app, ALICE, BOB)

    await send(app, ALICE, BOB, 'one')
    await send(app, BOB, ALICE, 'two')
    await send(app, ALICE, BOB, 'three')

    for (const [user, other] of [
      [ALICE, BOB],
      [BOB, ALICE],
    ]) {
      const response = await history(app, user!, other!)
      expect((response.body.messages as Message[]).map((m) => m.body)).toEqual([
        'one',
        'two',
        'three',
      ])
    }
  })

  it('trims whitespace and refuses an empty message', async () => {
    const app = buildApp()
    await signIn(app, ALICE, BOB)
    await befriend(app, ALICE, BOB)

    expect((await send(app, ALICE, BOB, '  padded  ')).body.message.body).toBe('padded')
    expect((await send(app, ALICE, BOB, '   ')).status).toBe(400)
    expect((await send(app, ALICE, BOB, '')).status).toBe(400)
  })

  it('caps the length, so one message cannot make every future poll expensive', async () => {
    const app = buildApp()
    await signIn(app, ALICE, BOB)
    await befriend(app, ALICE, BOB)

    expect((await send(app, ALICE, BOB, 'a'.repeat(MAX_MESSAGE_LENGTH))).status).toBe(201)
    expect((await send(app, ALICE, BOB, 'a'.repeat(MAX_MESSAGE_LENGTH + 1))).status).toBe(400)
  })

  it('stores the text exactly, escaping nothing — that is the renderer’s job', async () => {
    const app = buildApp()
    await signIn(app, ALICE, BOB)
    await befriend(app, ALICE, BOB)

    const payload = '<script>alert(1)</script> & "quotes"'
    await send(app, ALICE, BOB, payload)

    // Escaping on the way in would double-escape on the way out. React escapes
    // at render, and nothing in the client uses dangerouslySetInnerHTML.
    expect((await history(app, BOB, ALICE)).body.messages[0].body).toBe(payload)
  })
})

describe('who is allowed to read a conversation', () => {
  it('refuses somebody who is not a friend', async () => {
    const app = buildApp()
    await signIn(app, ALICE, BOB, MALLORY)
    await befriend(app, ALICE, BOB)
    await send(app, ALICE, BOB, 'private')

    // Mallory naming Alice gets Mallory-and-Alice, which does not exist and
    // which she is not in. There is no request shape that names Alice-and-Bob.
    const read = await as(app, MALLORY).get(`/api/chat/${ALICE}/messages`)
    expect(read.status).toBe(403)
    expect(read.body.error.code).toBe('NOT_FRIENDS')
  })

  it('refuses a stranger trying to send', async () => {
    const app = buildApp()
    await signIn(app, ALICE, MALLORY)

    expect((await send(app, MALLORY, ALICE, 'hi')).status).toBe(403)
  })

  it('refuses somebody with only a pending request', async () => {
    const app = buildApp()
    await signIn(app, ALICE, BOB)
    // Asked, not accepted. A request must not open a channel.
    await as(app, ALICE)
      .post('/api/friends/by-username')
      .send({ username: usernameOf(BOB) })

    expect((await send(app, ALICE, BOB, 'hi')).status).toBe(403)
    expect((await history(app, ALICE, BOB)).status).toBe(403)
  })

  it('closes the conversation the moment somebody is unfriended', async () => {
    const app = buildApp()
    await signIn(app, ALICE, BOB)
    await befriend(app, ALICE, BOB)
    await send(app, ALICE, BOB, 'hello')

    await as(app, ALICE).delete(`/api/friends/${BOB}`)

    // Checked on every read and write, not once when the window opened — an
    // already-open tab must stop working too.
    expect((await history(app, BOB, ALICE)).status).toBe(403)
    expect((await send(app, BOB, ALICE, 'still there?')).status).toBe(403)
  })

  it('a blocked person cannot message', async () => {
    const app = buildApp()
    await signIn(app, ALICE, BOB)
    await befriend(app, ALICE, BOB)
    await as(app, ALICE).post(`/api/friends/${BOB}/block`)

    expect((await send(app, BOB, ALICE, 'hey')).status).toBe(403)
    expect((await send(app, ALICE, BOB, 'hey')).status).toBe(403)
  })

  it('refuses messaging yourself', async () => {
    const app = buildApp()
    await signIn(app, ALICE)
    expect((await send(app, ALICE, ALICE, 'note to self')).status).toBe(400)
  })

  it('needs an account at all', async () => {
    const app = buildApp()
    expect((await request(app).get(`/api/chat/${BOB}/messages`)).status).toBe(401)
    expect((await request(app).post(`/api/chat/${BOB}/messages`).send({ body: 'x' })).status).toBe(
      401,
    )
  })
})

describe('notifying about messages', () => {
  const unreadFor = async (app: Server, user: string) =>
    ((await as(app, user).get('/api/sync')).body as { unreadCount: number }).unreadCount

  it('tells the recipient once, not once per message', async () => {
    const app = buildApp()
    await signIn(app, ALICE, BOB)
    await befriend(app, ALICE, BOB)
    // Bob has an unread friend_accepted from the befriending; clear it so the
    // count below is only about messages.
    await as(app, BOB).post('/api/sync/read')
    await as(app, ALICE).post('/api/sync/read')

    await send(app, ALICE, BOB, 'one')
    await send(app, ALICE, BOB, 'two')
    await send(app, ALICE, BOB, 'three')

    // Somebody typing three lines should not ring the bell three times.
    expect(await unreadFor(app, BOB)).toBe(1)
  })

  it('rings again once the earlier one has been read', async () => {
    const app = buildApp()
    await signIn(app, ALICE, BOB)
    await befriend(app, ALICE, BOB)
    await as(app, BOB).post('/api/sync/read')

    await send(app, ALICE, BOB, 'one')
    expect(await unreadFor(app, BOB)).toBe(1)

    await as(app, BOB).post('/api/sync/read')
    await send(app, ALICE, BOB, 'two')
    expect(await unreadFor(app, BOB)).toBe(1)
  })

  it('does not notify the sender', async () => {
    const app = buildApp()
    await signIn(app, ALICE, BOB)
    await befriend(app, ALICE, BOB)
    await as(app, ALICE).post('/api/sync/read')

    await send(app, ALICE, BOB, 'hello')
    expect(await unreadFor(app, ALICE)).toBe(0)
  })
})

describe('polling a conversation', () => {
  it('returns only what is newer than the cursor', async () => {
    const app = buildApp()
    await signIn(app, ALICE, BOB)
    await befriend(app, ALICE, BOB)

    await send(app, ALICE, BOB, 'first')
    const initial = await history(app, BOB, ALICE)
    const messages = initial.body.messages as Message[]
    const cursor = `${messages[0]!.createdAt}#${messages[0]!.id}`

    await send(app, ALICE, BOB, 'second')

    const next = await as(app, BOB).get(
      `/api/chat/${ALICE}/messages?since=${encodeURIComponent(cursor)}`,
    )
    expect((next.body.messages as Message[]).map((m) => m.body)).toEqual(['second'])
  })

  it('is never cached', async () => {
    const app = buildApp()
    await signIn(app, ALICE, BOB)
    await befriend(app, ALICE, BOB)

    const response = await history(app, ALICE, BOB)
    expect(response.headers['cache-control']).toMatch(/no-store/)
    expect(response.headers['cache-control']).toMatch(/private/)
  })
})
