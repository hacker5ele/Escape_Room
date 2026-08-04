import { describe, expect, it } from 'vitest'
import request from 'supertest'
import type { Express } from 'express'
import { createApp } from '../app.js'
import { createTestAuthenticator, TEST_USER_HEADER } from '../http/test-authenticator.js'

const ALICE = 'user_alice'
const BOB = 'user_bob'
const CAROL = 'user_carol'

function buildApp(): Express {
  return createApp({ authenticator: createTestAuthenticator(), attemptRateLimit: 1000 })
}

function as(app: Express, user: string) {
  return {
    get: (path: string) => request(app).get(path).set(TEST_USER_HEADER, user),
    post: (path: string) => request(app).post(path).set(TEST_USER_HEADER, user),
    delete: (path: string) => request(app).delete(path).set(TEST_USER_HEADER, user),
  }
}

/** Profiles exist only once somebody has opened their game. */
async function signIn(app: Express, ...users: string[]) {
  for (const user of users) {
    await as(app, user).post('/api/sessions').send({})
  }
}

const usernameOf = (user: string) => `handle_${user}`

describe('adding a friend by username', () => {
  it('creates a request that each side sees from its own point of view', async () => {
    const app = buildApp()
    await signIn(app, ALICE, BOB)

    const sent = await as(app, ALICE)
      .post('/api/friends/by-username')
      .send({ username: usernameOf(BOB) })

    expect(sent.status).toBe(201)
    expect(sent.body.outgoing).toHaveLength(1)
    expect(sent.body.outgoing[0].profile.userId).toBe(BOB)

    const bobSees = await as(app, BOB).get('/api/friends')
    expect(bobSees.body.incoming).toHaveLength(1)
    expect(bobSees.body.incoming[0].profile.userId).toBe(ALICE)
    expect(bobSees.body.friends).toHaveLength(0)
  })

  it('attaches the profile so faces render without a second round trip', async () => {
    const app = buildApp()
    await signIn(app, ALICE, BOB)
    await as(app, ALICE).post('/api/friends/by-username').send({ username: usernameOf(BOB) })

    const list = await as(app, ALICE).get('/api/friends')
    expect(list.body.outgoing[0].profile).toMatchObject({
      userId: BOB,
      username: usernameOf(BOB),
      displayName: 'Test Player',
    })
  })

  it('refuses to befriend yourself', async () => {
    const app = buildApp()
    await signIn(app, ALICE)

    const response = await as(app, ALICE)
      .post('/api/friends/by-username')
      .send({ username: usernameOf(ALICE) })

    expect(response.status).toBe(400)
    expect(response.body.error.code).toBe('CANNOT_FRIEND_SELF')
  })

  it('404s for an unknown username, hinting at the eventually-consistent index', async () => {
    const app = buildApp()
    await signIn(app, ALICE)

    const response = await as(app, ALICE)
      .post('/api/friends/by-username')
      .send({ username: 'nobody' })

    expect(response.status).toBe(404)
    expect(response.body.error.message).toMatch(/just signed up/i)
  })

  it('treats a request back as an acceptance, so simultaneous requests resolve', async () => {
    const app = buildApp()
    await signIn(app, ALICE, BOB)

    await as(app, ALICE).post('/api/friends/by-username').send({ username: usernameOf(BOB) })
    // Without this, both sides would sit on an outgoing request forever.
    const bobAsks = await as(app, BOB)
      .post('/api/friends/by-username')
      .send({ username: usernameOf(ALICE) })

    expect(bobAsks.body.friends).toHaveLength(1)
    expect((await as(app, ALICE).get('/api/friends')).body.friends).toHaveLength(1)
  })

  it('refuses a duplicate request once you are already friends', async () => {
    const app = buildApp()
    await signIn(app, ALICE, BOB)
    await as(app, ALICE).post('/api/friends/by-username').send({ username: usernameOf(BOB) })
    await as(app, BOB).post(`/api/friends/${ALICE}/accept`)

    const again = await as(app, ALICE)
      .post('/api/friends/by-username')
      .send({ username: usernameOf(BOB) })

    expect(again.status).toBe(409)
    expect(again.body.error.code).toBe('ALREADY_FRIENDS')
  })
})

describe('accepting and removing', () => {
  it('makes both sides friends', async () => {
    const app = buildApp()
    await signIn(app, ALICE, BOB)
    await as(app, ALICE).post('/api/friends/by-username').send({ username: usernameOf(BOB) })

    const accepted = await as(app, BOB).post(`/api/friends/${ALICE}/accept`)
    expect(accepted.status).toBe(200)
    expect(accepted.body.friends).toHaveLength(1)
    expect((await as(app, ALICE).get('/api/friends')).body.friends).toHaveLength(1)
  })

  it('cannot accept a request that was never sent', async () => {
    const app = buildApp()
    await signIn(app, ALICE, BOB)

    const response = await as(app, BOB).post(`/api/friends/${ALICE}/accept`)
    expect(response.status).toBe(404)
  })

  it('removes the friendship from both sides at once', async () => {
    const app = buildApp()
    await signIn(app, ALICE, BOB)
    await as(app, ALICE).post('/api/friends/by-username').send({ username: usernameOf(BOB) })
    await as(app, BOB).post(`/api/friends/${ALICE}/accept`)

    await as(app, ALICE).delete(`/api/friends/${BOB}`)

    // A one-sided friendship is the bug the transactional write exists to
    // prevent, so check the far side rather than just the near one.
    expect((await as(app, ALICE).get('/api/friends')).body.friends).toHaveLength(0)
    expect((await as(app, BOB).get('/api/friends')).body.friends).toHaveLength(0)
  })
})

describe('blocking', () => {
  it('removes the friendship and hides it from the blocked person', async () => {
    const app = buildApp()
    await signIn(app, ALICE, BOB)
    await as(app, ALICE).post('/api/friends/by-username').send({ username: usernameOf(BOB) })
    await as(app, BOB).post(`/api/friends/${ALICE}/accept`)

    await as(app, ALICE).post(`/api/friends/${BOB}/block`)

    const aliceSees = await as(app, ALICE).get('/api/friends')
    expect(aliceSees.body.friends).toHaveLength(0)

    // Bob is told nothing at all — his edge is gone, not marked.
    const bobSees = await as(app, BOB).get('/api/friends')
    expect(bobSees.body.friends).toHaveLength(0)
    expect(bobSees.body.incoming).toHaveLength(0)
  })

  it('a blocked person cannot get back in by sending a new request', async () => {
    const app = buildApp()
    await signIn(app, ALICE, BOB)
    await as(app, ALICE).post(`/api/friends/${BOB}/block`)

    // This must not overwrite Alice's block. Writing both sides of the pair
    // here would silently undo it — a request would become a way out of being
    // blocked.
    const bobTries = await as(app, BOB)
      .post('/api/friends/by-username')
      .send({ username: usernameOf(ALICE) })

    // Bob is not told he is blocked; it looks like an ordinary unanswered
    // request, because telling him would just prompt a second account.
    expect(bobTries.status).toBe(201)

    const aliceSees = await as(app, ALICE).get('/api/friends')
    expect(aliceSees.body.incoming).toHaveLength(0)
    expect(aliceSees.body.friends).toHaveLength(0)
  })

  it('unblocking clears the block', async () => {
    const app = buildApp()
    await signIn(app, ALICE, BOB)
    await as(app, ALICE).post(`/api/friends/${BOB}/block`)
    await as(app, ALICE).post(`/api/friends/${BOB}/unblock`)

    const response = await as(app, ALICE)
      .post('/api/friends/by-username')
      .send({ username: usernameOf(BOB) })
    expect(response.status).toBe(201)
  })

  it('refuses to block yourself', async () => {
    const app = buildApp()
    await signIn(app, ALICE)
    const response = await as(app, ALICE).post(`/api/friends/${ALICE}/block`)
    expect(response.status).toBe(400)
  })
})

describe('invite links', () => {
  async function mint(app: Express, user: string): Promise<string> {
    const response = await as(app, user).post('/api/invites').send({})
    expect(response.status).toBe(201)
    return response.body.invite.token as string
  }

  it('mints an unguessable token', async () => {
    const app = buildApp()
    await signIn(app, ALICE)
    const token = await mint(app, ALICE)

    // 16 random bytes, base64url — 22 characters, 128 bits.
    expect(token).toMatch(/^[A-Za-z0-9_-]{20,}$/)
  })

  it('previews the inviter without signing in — that is the point of a link', async () => {
    const app = buildApp()
    await signIn(app, ALICE)
    const token = await mint(app, ALICE)

    const preview = await request(app).get(`/api/invites/${token}`)
    expect(preview.status).toBe(200)
    expect(preview.body.inviter.userId).toBe(ALICE)
  })

  it('the preview leaks nothing beyond the public profile', async () => {
    const app = buildApp()
    await signIn(app, ALICE)
    const token = await mint(app, ALICE)

    const preview = await request(app).get(`/api/invites/${token}`)
    expect(Object.keys(preview.body)).toEqual(['inviter'])
    // Not who else joined, not when it was made, not how many times used.
    expect(JSON.stringify(preview.body)).not.toMatch(/useCount|createdAt|expiresAt/)
  })

  it('makes the two people friends immediately, with nothing left to approve', async () => {
    const app = buildApp()
    await signIn(app, ALICE, BOB)
    const token = await mint(app, ALICE)

    const accepted = await as(app, BOB).post(`/api/invites/${token}/accept`)
    expect(accepted.status).toBe(201)

    // The link was Alice's consent — making her approve the person who used it
    // asks her to confirm the same thing twice, and leaves Bob looking at a
    // screen where nothing appears to have happened.
    expect(accepted.body.friends).toHaveLength(1)
    expect(accepted.body.outgoing).toHaveLength(0)

    const aliceSees = await as(app, ALICE).get('/api/friends')
    expect(aliceSees.body.friends.map((f: { profile: { userId: string } }) => f.profile.userId)).toEqual([BOB])
    expect(aliceSees.body.incoming).toHaveLength(0)
  })

  it('does not let a link get somebody past a block', async () => {
    const app = buildApp()
    await signIn(app, ALICE, BOB)
    const token = await mint(app, ALICE)
    await as(app, ALICE).post(`/api/friends/${BOB}/block`)

    // A link sent before the block must not be a way back in. Bob is told
    // nothing, exactly as with an ordinary request.
    expect((await as(app, BOB).post(`/api/invites/${token}/accept`)).status).toBe(201)

    const aliceSees = await as(app, ALICE).get('/api/friends')
    expect(aliceSees.body.friends).toHaveLength(0)
    expect(aliceSees.body.incoming).toHaveLength(0)
  })

  it('tells the inviter somebody joined', async () => {
    const app = buildApp()
    await signIn(app, ALICE, BOB)
    const token = await mint(app, ALICE)
    await as(app, ALICE).post('/api/sync/read')

    await as(app, BOB).post(`/api/invites/${token}/accept`)

    const sync = await as(app, ALICE).get('/api/sync')
    expect(sync.body.unreadCount).toBe(1)
    expect(sync.body.notifications[0].message).toMatch(/invite link/i)
  })

  it('refuses your own link rather than making you your own friend', async () => {
    const app = buildApp()
    await signIn(app, ALICE)
    const token = await mint(app, ALICE)

    const response = await as(app, ALICE).post(`/api/invites/${token}/accept`)
    expect(response.status).toBe(400)
    expect(response.body.error.code).toBe('CANNOT_FRIEND_SELF')
  })

  it('stops working once revoked', async () => {
    const app = buildApp()
    await signIn(app, ALICE, BOB)
    const token = await mint(app, ALICE)

    await as(app, ALICE).delete(`/api/invites/${token}`).expect(204)

    expect((await request(app).get(`/api/invites/${token}`)).status).toBe(404)
    expect((await as(app, BOB).post(`/api/invites/${token}/accept`)).status).toBe(404)
  })

  it('cannot be revoked by somebody else', async () => {
    const app = buildApp()
    await signIn(app, ALICE, BOB)
    const token = await mint(app, ALICE)

    // Reports the same error as a token that does not exist, so this cannot be
    // used to discover whether one does.
    const response = await as(app, BOB).delete(`/api/invites/${token}`)
    expect(response.status).toBe(404)

    // And it still works for its owner.
    expect((await request(app).get(`/api/invites/${token}`)).status).toBe(200)
  })

  it('reports an unknown token exactly like a revoked one', async () => {
    const app = buildApp()
    await signIn(app, ALICE)

    const unknown = await request(app).get('/api/invites/completely-made-up')
    expect(unknown.status).toBe(404)
    expect(unknown.body.error.code).toBe('INVITE_INVALID')
  })

  it('lists the owner’s own links so they can be shared or revoked', async () => {
    const app = buildApp()
    await signIn(app, ALICE)
    await mint(app, ALICE)
    await mint(app, ALICE)

    const list = await as(app, ALICE).get('/api/invites')
    expect(list.body.invites).toHaveLength(2)
  })

  it('does not list a revoked link', async () => {
    const app = buildApp()
    await signIn(app, ALICE)
    const token = await mint(app, ALICE)
    await as(app, ALICE).delete(`/api/invites/${token}`)

    expect((await as(app, ALICE).get('/api/invites')).body.invites).toHaveLength(0)
  })

  it('keeps each person’s links to themselves', async () => {
    const app = buildApp()
    await signIn(app, ALICE, CAROL)
    await mint(app, ALICE)

    expect((await as(app, CAROL).get('/api/invites')).body.invites).toHaveLength(0)
  })
})

describe('the friend endpoints require signing in', () => {
  it('refuses an anonymous caller everywhere except the invite preview', async () => {
    const app = buildApp()

    for (const path of ['/api/friends', '/api/invites']) {
      expect((await request(app).get(path)).status, path).toBe(401)
    }
    expect((await request(app).post('/api/invites').send({})).status).toBe(401)
  })
})
