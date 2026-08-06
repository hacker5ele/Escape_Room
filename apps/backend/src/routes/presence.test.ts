import { describe, expect, it } from 'vitest'
import request from 'supertest'
import type { Server } from 'node:http'
import type { HeartbeatResponse } from '@escape-room/shared'
import { STAGE_BOUNDS } from '@escape-room/shared'
import { createTestApp as createApp } from '../test/server.js'
import { InMemoryGameRepository } from '../repositories/game.repository.js'
import { createTestAuthenticator, TEST_USER_HEADER } from '../http/test-authenticator.js'

const ALICE = 'user_alice'
const BOB = 'user_bob'
const CAROL = 'user_carol'
const DAVE = 'user_dave'
const ERIN = 'user_erin'

const CHARACTER = { head: 'head-01', body: 'body-01', arm: 'arm-01', leg: 'leg-01' }

function buildApp() {
  return createApp({
    authenticator: createTestAuthenticator(),
    attemptRateLimit: 1000,
    gameRepository: new InMemoryGameRepository(),
  })
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

/** One heartbeat, with sensible defaults for everything not under test. */
async function beat(
  app: Server,
  user: string,
  overrides: Record<string, unknown> = {},
): Promise<HeartbeatResponse> {
  const response = await as(app, user)
    .post('/api/stage/heartbeat')
    .send({
      x: 800,
      y: 800,
      facing: 1,
      walking: false,
      character: CHARACTER,
      ready: false,
      emote: null,
      hidden: false,
      acted: [],
      holding: null,
      ...overrides,
    })
  expect(response.status).toBe(200)
  return response.body as HeartbeatResponse
}

describe('the stage heartbeat', () => {
  it('needs an account', async () => {
    const app = buildApp()
    expect((await request(app).post('/api/stage/heartbeat').send({})).status).toBe(401)
  })

  it('refuses a body that is not a position', async () => {
    const app = buildApp()
    await signIn(app, ALICE)
    const response = await as(app, ALICE).post('/api/stage/heartbeat').send({ x: 'over there' })
    expect(response.status).toBe(400)
  })

  it('shows you nobody when you are playing alone', async () => {
    const app = buildApp()
    await signIn(app, ALICE)

    const body = await beat(app, ALICE)
    expect(body.peers).toEqual([])
    expect(body.isHost).toBe(true)
    expect(body.phase).toEqual({ kind: 'lobby' })
  })

  it('shows two people in the same party to each other', async () => {
    const app = buildApp()
    await signIn(app, ALICE, BOB)
    await befriend(app, ALICE, BOB)
    await as(app, BOB).post(`/api/party/join/${ALICE}`)

    await beat(app, ALICE, { x: 500 })
    const bobSees = await beat(app, BOB, { x: 1000 })

    expect(bobSees.peers.map((peer) => peer.profile.userId)).toEqual([ALICE])
    expect(bobSees.peers[0]?.x).toBe(500)
    expect(bobSees.peers[0]?.isHost).toBe(true)
    expect(bobSees.isHost).toBe(false)

    const aliceSees = await beat(app, ALICE, { x: 500 })
    expect(aliceSees.peers.map((peer) => peer.profile.userId)).toEqual([BOB])
  })

  it('does not show you somebody who is merely a friend', async () => {
    // Friendship is not presence. Standing in your own lobby should not put you
    // in everybody you know's room.
    const app = buildApp()
    await signIn(app, ALICE, BOB)
    await befriend(app, ALICE, BOB)

    await beat(app, BOB)
    expect((await beat(app, ALICE)).peers).toEqual([])
  })

  it('clamps a position to the stage rather than trusting it', async () => {
    const app = buildApp()
    await signIn(app, ALICE, BOB)
    await befriend(app, ALICE, BOB)
    await as(app, BOB).post(`/api/party/join/${ALICE}`)

    // Presence is cosmetic, but an unclamped client could park somebody's
    // character off-screen for everybody who can see them.
    await beat(app, ALICE, { x: 99999, y: -99999 })

    const peer = (await beat(app, BOB)).peers[0]
    expect(peer?.x).toBe(STAGE_BOUNDS.maxX)
    expect(peer?.y).toBe(STAGE_BOUNDS.minY)
  })

  it('refuses a position that is not a number at all', async () => {
    const app = buildApp()
    await signIn(app, ALICE)
    const response = await as(app, ALICE).post('/api/stage/heartbeat').send({
      x: Number.NaN,
      y: 800,
      facing: 1,
      walking: false,
      character: CHARACTER,
      ready: false,
      emote: null,
      hidden: false,
    })
    // NaN fails every comparison, so it has to be rejected rather than clamped.
    expect(response.status).toBe(400)
  })

  it('carries an emote to the people who can see you', async () => {
    const app = buildApp()
    await signIn(app, ALICE, BOB)
    await befriend(app, ALICE, BOB)
    await as(app, BOB).post(`/api/party/join/${ALICE}`)

    await beat(app, ALICE, { emote: 'dance' })
    const seen = (await beat(app, BOB)).peers[0]

    expect(seen?.emote).toBe('dance')
    // Sent with a start time so a peer can join the dance part-way through and
    // still see it end when everybody else does.
    expect(seen?.emoteStartedAt).toBeTruthy()
  })

  it('holds the last emote rather than clearing it on the next beat', async () => {
    const app = buildApp()
    await signIn(app, ALICE, BOB)
    await befriend(app, ALICE, BOB)
    await as(app, BOB).post(`/api/party/join/${ALICE}`)

    await beat(app, ALICE, { emote: 'wave' })
    await beat(app, ALICE, { emote: null })

    // Reported once, on the beat it starts — so a null afterwards means "no
    // new emote", not "stop".
    expect((await beat(app, BOB)).peers[0]?.emote).toBe('wave')
  })

  it('reports whether somebody has readied up', async () => {
    const app = buildApp()
    await signIn(app, ALICE, BOB)
    await befriend(app, ALICE, BOB)
    await as(app, BOB).post(`/api/party/join/${ALICE}`)

    await beat(app, BOB, { ready: true })
    expect((await beat(app, ALICE)).peers[0]?.ready).toBe(true)
  })
})

describe('moving the party', () => {
  it('lets the host take everybody into a room', async () => {
    const app = buildApp()
    await signIn(app, ALICE, BOB)
    await befriend(app, ALICE, BOB)
    await as(app, BOB).post(`/api/party/join/${ALICE}`)

    expect(
      (await as(app, ALICE).post('/api/stage/phase').send({ kind: 'room', roomId: 'room-01' }))
        .status,
    ).toBe(204)

    // The guest learns about it on their next beat and follows. That is how the
    // move travels with no socket and nothing pushed.
    expect((await beat(app, BOB)).phase).toEqual({ kind: 'room', roomId: 'room-01' })
  })

  it('refuses to let a guest move the party', async () => {
    const app = buildApp()
    await signIn(app, ALICE, BOB)
    await befriend(app, ALICE, BOB)
    await as(app, BOB).post(`/api/party/join/${ALICE}`)

    const response = await as(app, BOB)
      .post('/api/stage/phase')
      .send({ kind: 'room', roomId: 'room-01' })

    expect(response.status).toBe(403)
    expect(response.body.error.code).toBe('NOT_HOST')
    expect((await beat(app, ALICE)).phase).toEqual({ kind: 'lobby' })
  })

  it('refuses a room that is not a room', async () => {
    const app = buildApp()
    await signIn(app, ALICE)
    expect(
      (await as(app, ALICE).post('/api/stage/phase').send({ kind: 'room', roomId: 'room-99' }))
        .status,
    ).toBe(400)
  })
})

describe('leaving the stage', () => {
  it('takes you off it for everybody else', async () => {
    const app = buildApp()
    await signIn(app, ALICE, BOB)
    await befriend(app, ALICE, BOB)
    await as(app, BOB).post(`/api/party/join/${ALICE}`)

    await beat(app, BOB)
    expect((await beat(app, ALICE)).peers).toHaveLength(1)

    expect((await as(app, BOB).delete('/api/stage')).status).toBe(204)
    expect((await beat(app, ALICE)).peers).toHaveLength(0)
  })

  it('does not take you out of the game as well', async () => {
    // Walking to the leaderboard is not leaving your friend's game. Presence
    // and membership share one expiry (ADR-0045), so this is the one place the
    // two are deliberately pulled apart — and the one departure that is a real
    // click rather than a guess about an unloading page.
    const app = buildApp()
    await signIn(app, ALICE, BOB)
    await befriend(app, ALICE, BOB)
    await as(app, BOB).post(`/api/party/join/${ALICE}`)
    await beat(app, BOB)

    await as(app, BOB).delete('/api/stage')

    const party = (await as(app, ALICE).get('/api/party')).body.party
    expect(party.members).toHaveLength(1)
    expect((await as(app, BOB).get('/api/party')).body.party.isHost).toBe(false)
  })
})

describe('saying you are still here from somewhere else', () => {
  it('keeps you in the party without putting you on the stage', async () => {
    // `useLiveness` beats this from every screen. Somebody reading the
    // leaderboard is in the game and standing nowhere.
    const app = buildApp()
    await signIn(app, ALICE, BOB)
    await befriend(app, ALICE, BOB)
    await as(app, BOB).post(`/api/party/join/${ALICE}`)

    expect((await as(app, BOB).post('/api/stage/alive').send({ hidden: false })).status).toBe(204)

    expect((await as(app, ALICE).get('/api/party')).body.party.members).toHaveLength(1)
    expect((await beat(app, ALICE)).peers).toHaveLength(0)
  })

  it('needs an account', async () => {
    const app = buildApp()
    expect((await request(app).post('/api/stage/alive').send({ hidden: false })).status).toBe(401)
  })

  it('refuses a beat that does not say whether the tab is hidden', async () => {
    // The server cannot tell a closed tab from a throttled one; this flag is
    // the only thing that can, so a beat without it is not a beat.
    const app = buildApp()
    await signIn(app, ALICE)
    expect((await as(app, ALICE).post('/api/stage/alive').send({})).status).toBe(400)
  })
})

describe('the party has a size limit', () => {
  it('refuses a fifth person', async () => {
    // Four is a party; thirty is a wall of overlapping characters, and on
    // Friday that is the demo failing in public.
    const app = buildApp()
    await signIn(app, ALICE, BOB, CAROL, DAVE, ERIN)
    for (const guest of [BOB, CAROL, DAVE, ERIN]) await befriend(app, ALICE, guest)

    for (const guest of [BOB, CAROL, DAVE]) {
      expect((await as(app, guest).post(`/api/party/join/${ALICE}`)).status).toBe(201)
    }

    const overflow = await as(app, ERIN).post(`/api/party/join/${ALICE}`)
    expect(overflow.status).toBe(409)
    expect(overflow.body.error.code).toBe('PARTY_FULL')
  })
})

/**
 * The Reading Hall, through the whole chain rather than in a unit test.
 *
 * `hall.test.ts` already exercises the mechanism by handing it a clock and a
 * list of occupants. What it cannot show is that the *real* occupants ever
 * reach it: that a party of two resolves to one hall, that both members are
 * gathered off the live store, and that standing at a station is noticed.
 * Everything between the heartbeat and the water was untested until here.
 *
 * The assertions are on `trend` rather than on `depth`, deliberately. Depth
 * moves with wall-clock time and these beats are microseconds apart, so a test
 * that watched the level would be testing its own scheduler. `trend` is derived
 * from which wheels are turning *right now* — which is exactly the link in the
 * chain worth proving.
 */
describe('the hall, from the heartbeat', () => {
  const WEST = { x: 200, y: 800 }
  const EAST = { x: 1330, y: 800 }
  const MIDDLE = { x: 800, y: 800 }

  async function partyInTheHall(app: Server) {
    await signIn(app, ALICE, BOB)
    await befriend(app, ALICE, BOB)
    await as(app, BOB).post(`/api/party/join/${ALICE}`)
    // The host's location is the party's location (ADR-0040).
    await as(app, ALICE).post('/api/stage/phase').send({ kind: 'room', roomId: 'room-01' })
  }

  it('gives a party standing in it one hall, not one each', async () => {
    const app = buildApp()
    await partyInTheHall(app)

    // Only the host takes hold of a wheel — at the far west end of the room.
    await beat(app, ALICE, { ...WEST, holding: 'wheel-west' })

    // And the guest, standing in the middle and nowhere near it, sees it
    // turning. A hall of their own would still be rising, which is the whole
    // point of the assertion: comparing the two depths proves nothing, because
    // two freshly-created halls start at the same number anyway.
    const guest = await beat(app, BOB, MIDDLE)

    expect(guest.room?.roomId).toBe('room-01')
    expect(guest.room?.trend).toBe('holding')
  })

  it('counts the people actually standing in it', async () => {
    const app = buildApp()
    await partyInTheHall(app)

    await beat(app, ALICE, MIDDLE)
    expect((await beat(app, BOB, MIDDLE)).room?.counted).toBe(2)
  })

  it('notices two people at the two wheels, and pumps', async () => {
    const app = buildApp()
    await partyInTheHall(app)

    expect((await beat(app, ALICE, MIDDLE)).room?.trend).toBe('rising')

    await beat(app, ALICE, { ...WEST, holding: 'wheel-west' })
    expect((await beat(app, BOB, MIDDLE)).room?.trend).toBe('holding')

    await beat(app, BOB, { ...EAST, holding: 'wheel-east' })
    expect((await beat(app, ALICE, { ...WEST, holding: 'wheel-west' })).room?.trend).toBe('falling')
  })

  /**
   * The whole of what pressing E bought, at the far end of the chain: standing
   * somewhere is no longer doing something. You have to take hold of it.
   */
  it('does not pump for somebody standing at a wheel without taking hold', async () => {
    const app = buildApp()
    await partyInTheHall(app)

    expect((await beat(app, ALICE, WEST)).room?.trend).toBe('rising')
  })

  it('refuses a wheel claimed from the other end of the hall', async () => {
    const app = buildApp()
    await partyInTheHall(app)

    const body = await beat(app, ALICE, { ...MIDDLE, holding: 'wheel-west' })
    expect(body.room?.trend).toBe('rising')
  })

  it('has no hall at all in the lobby', async () => {
    const app = buildApp()
    await signIn(app, ALICE)
    expect((await beat(app, ALICE, MIDDLE)).room).toBeNull()
  })

  it('throws the hall away when the party leaves it', async () => {
    const app = buildApp()
    await partyInTheHall(app)
    await beat(app, ALICE, MIDDLE)

    await as(app, ALICE).post('/api/stage/phase').send({ kind: 'lobby' })

    expect((await beat(app, ALICE, MIDDLE)).room).toBeNull()
  })
})
