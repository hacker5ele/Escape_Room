import { describe, expect, it } from 'vitest'
import request from 'supertest'
import type { Express } from 'express'
import type { SyncResponse } from '@escape-room/shared'
import { createApp } from '../app.js'
import { createTestAuthenticator, TEST_USER_HEADER } from '../http/test-authenticator.js'

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

async function signIn(app: Express, ...users: string[]) {
  for (const user of users) {
    await as(app, user).post('/api/sessions').send({})
  }
}

const usernameOf = (user: string) => `handle_${user}`

async function sync(app: Express, user: string, since?: string): Promise<SyncResponse> {
  const path = since ? `/api/sync?since=${encodeURIComponent(since)}` : '/api/sync'
  const response = await as(app, user).get(path)
  expect(response.status).toBe(200)
  return response.body as SyncResponse
}

/** Alice asks Bob to be her friend. */
async function askToBeFriends(app: Express) {
  await as(app, ALICE).post('/api/friends/by-username').send({ username: usernameOf(BOB) })
}

describe('the sync endpoint', () => {
  it('needs an account', async () => {
    expect((await request(buildApp()).get('/api/sync')).status).toBe(401)
  })

  it('starts empty', async () => {
    const app = buildApp()
    await signIn(app, ALICE)

    const body = await sync(app, ALICE)
    expect(body.notifications).toEqual([])
    expect(body.unreadCount).toBe(0)
    expect(Date.parse(body.now)).not.toBeNaN()
  })

  it('tells you when somebody asks to be your friend', async () => {
    const app = buildApp()
    await signIn(app, ALICE, BOB)
    await askToBeFriends(app)

    const body = await sync(app, BOB)
    expect(body.unreadCount).toBe(1)
    expect(body.notifications).toHaveLength(1)
    expect(body.notifications[0]).toMatchObject({
      type: 'friend_request',
      readAt: null,
    })
    expect(body.notifications[0]!.message).toMatch(/wants to be your friend/i)
  })

  it('attaches the actor so a face renders next to it', async () => {
    const app = buildApp()
    await signIn(app, ALICE, BOB)
    await askToBeFriends(app)

    const body = await sync(app, BOB)
    expect(body.notifications[0]!.actor).toMatchObject({
      userId: ALICE,
      username: usernameOf(ALICE),
    })
  })

  it('does not tell the person who sent the request', async () => {
    const app = buildApp()
    await signIn(app, ALICE, BOB)
    await askToBeFriends(app)

    expect((await sync(app, ALICE)).notifications).toHaveLength(0)
  })

  it('tells the requester when they are accepted', async () => {
    const app = buildApp()
    await signIn(app, ALICE, BOB)
    await askToBeFriends(app)
    await as(app, BOB).post(`/api/friends/${ALICE}/accept`)

    const body = await sync(app, ALICE)
    expect(body.notifications).toHaveLength(1)
    expect(body.notifications[0]!.type).toBe('friend_accepted')
    expect(body.notifications[0]!.message).toMatch(/accepted your friend request/i)
  })

  it('says nothing to a blocked person, and nothing to the blocker', async () => {
    const app = buildApp()
    await signIn(app, ALICE, BOB)
    await as(app, ALICE).post(`/api/friends/${BOB}/block`)

    // Bob's request is silently one-sided. Notifying Alice would defeat the
    // block; notifying Bob that it failed would tell him he is blocked.
    await as(app, BOB).post('/api/friends/by-username').send({ username: usernameOf(ALICE) })

    expect((await sync(app, ALICE)).notifications).toHaveLength(0)
    expect((await sync(app, BOB)).notifications).toHaveLength(0)
  })

  it('does not leak one account’s notifications to another', async () => {
    const app = buildApp()
    await signIn(app, ALICE, BOB)
    await askToBeFriends(app)

    expect((await sync(app, BOB)).notifications).toHaveLength(1)
    expect((await sync(app, ALICE)).notifications).toHaveLength(0)
  })
})

describe('the polling cursor', () => {
  it('re-sends anything inside the overlap window, so the client dedupes by id', async () => {
    const app = buildApp()
    await signIn(app, ALICE, BOB)
    await askToBeFriends(app)

    const first = await sync(app, BOB)
    const second = await sync(app, BOB, first.now)

    // Not a bug — the point. The window trades a duplicate the client can drop
    // for a notification it would otherwise never see.
    expect(second.notifications).toHaveLength(1)
    expect(second.notifications[0]!.id).toBe(first.notifications[0]!.id)
  })

  it('stops re-sending once the cursor is past the overlap window', async () => {
    const app = buildApp()
    await signIn(app, ALICE, BOB)
    await askToBeFriends(app)

    const wellPast = new Date(Date.now() + 60_000).toISOString()
    expect((await sync(app, BOB, wellPast)).notifications).toHaveLength(0)
  })

  it('keeps the badge right even when the page is empty', async () => {
    const app = buildApp()
    await signIn(app, ALICE, BOB)
    await askToBeFriends(app)

    const wellPast = new Date(Date.now() + 60_000).toISOString()
    const caughtUp = await sync(app, BOB, wellPast)

    // Counted from storage, not from what this page happened to return, so a
    // client that has already caught up still sees the right number.
    expect(caughtUp.notifications).toHaveLength(0)
    expect(caughtUp.unreadCount).toBe(1)
  })

  it('falls back to everything when the cursor is nonsense', async () => {
    const app = buildApp()
    await signIn(app, ALICE, BOB)
    await askToBeFriends(app)

    // A truncated or hand-edited parameter must not create a silent gap.
    for (const cursor of ['banana', '', '99999-13-45T99:99:99Z']) {
      expect((await sync(app, BOB, cursor)).notifications, cursor).toHaveLength(1)
    }
  })

  it('does not skip a notification written just before the last poll', async () => {
    const app = buildApp()
    await signIn(app, ALICE, BOB)

    const before = await sync(app, BOB)
    await askToBeFriends(app)

    // The overlap window is what makes this safe: `now` from a poll can be
    // newer than a row that had not landed yet, and asking for strictly-newer
    // would lose it forever.
    expect((await sync(app, BOB, before.now)).notifications).toHaveLength(1)
  })
})

describe('marking notifications read', () => {
  it('clears the badge', async () => {
    const app = buildApp()
    await signIn(app, ALICE, BOB)
    await askToBeFriends(app)

    expect((await sync(app, BOB)).unreadCount).toBe(1)

    await as(app, BOB).post('/api/sync/read').expect(204)

    expect((await sync(app, BOB)).unreadCount).toBe(0)
  })

  it('keeps the notification, only marks it seen', async () => {
    const app = buildApp()
    await signIn(app, ALICE, BOB)
    await askToBeFriends(app)
    await as(app, BOB).post('/api/sync/read')

    const body = await sync(app, BOB)
    expect(body.notifications).toHaveLength(1)
    expect(body.notifications[0]!.readAt).not.toBeNull()
  })

  it('only clears your own', async () => {
    const app = buildApp()
    await signIn(app, ALICE, BOB)
    await askToBeFriends(app)

    await as(app, ALICE).post('/api/sync/read')
    expect((await sync(app, BOB)).unreadCount).toBe(1)
  })
})

describe('caching', () => {
  it('is never cached — it is per-account and polled constantly', async () => {
    const app = buildApp()
    await signIn(app, ALICE)

    const response = await as(app, ALICE).get('/api/sync')
    expect(response.headers['cache-control']).toMatch(/no-store/)
    expect(response.headers['cache-control']).toMatch(/private/)
  })
})
