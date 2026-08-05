import { describe, expect, it } from 'vitest'
import request from 'supertest'
import type { Server } from 'node:http'
import type { LeaderboardEntry } from '@escape-room/shared'
import { ROOM_IDS } from '@escape-room/shared'
import { createTestApp as createApp } from '../test/server.js'
import { InMemoryGameRepository } from '../repositories/game.repository.js'
import { createTestAuthenticator, TEST_USER_HEADER } from '../http/test-authenticator.js'

const ALICE = 'user_alice'
const BOB = 'user_bob'
const CAROL = 'user_carol'

function buildApp(gameRepository = new InMemoryGameRepository()) {
  return {
    app: createApp({
      authenticator: createTestAuthenticator(),
      attemptRateLimit: 1000,
      gameRepository,
    }),
    gameRepository,
  }
}

function as(app: Server, user: string) {
  return {
    get: (path: string) => request(app).get(path).set(TEST_USER_HEADER, user),
    post: (path: string) => request(app).post(path).set(TEST_USER_HEADER, user),
  }
}

async function signIn(app: Server, ...users: string[]) {
  for (const user of users) await as(app, user).post('/api/sessions').send({})
}

const usernameOf = (user: string) => `handle_${user}`

async function befriend(app: Server, a: string, b: string) {
  await as(app, a).post('/api/friends/by-username').send({ username: usernameOf(b) })
  await as(app, b).post(`/api/friends/${a}/accept`)
}

/** Rewrites a player's stored game so the board has something to rank. */
async function setProgress(
  repository: InMemoryGameRepository,
  userId: string,
  progress: { solved: number; hints?: number; finishedAfterMs?: number },
) {
  const game = await repository.findByUserId(userId)
  if (!game) throw new Error(`${userId} has no game`)

  const startedAt = new Date(0).toISOString()
  await repository.save({
    ...game,
    startedAt,
    solvedRooms: ROOM_IDS.slice(0, progress.solved),
    hintsUsed: progress.hints ?? 0,
    finishedAt:
      progress.finishedAfterMs === undefined
        ? null
        : new Date(progress.finishedAfterMs).toISOString(),
  })
}

const board = async (app: Server, user: string): Promise<LeaderboardEntry[]> => {
  const response = await as(app, user).get('/api/leaderboard/friends')
  expect(response.status).toBe(200)
  return response.body.entries as LeaderboardEntry[]
}

describe('the friends leaderboard', () => {
  it('needs an account', async () => {
    const { app } = buildApp()
    expect((await request(app).get('/api/leaderboard/friends')).status).toBe(401)
  })

  it('shows you even when you have no friends', async () => {
    const { app } = buildApp()
    await signIn(app, ALICE)

    const entries = await board(app, ALICE)
    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({ isMe: true, solvedRooms: 0 })
  })

  it('includes friends but not strangers', async () => {
    const { app } = buildApp()
    await signIn(app, ALICE, BOB, CAROL)
    await befriend(app, ALICE, BOB)

    const usernames = (await board(app, ALICE)).map((entry) => entry.profile.userId)
    expect(usernames).toContain(BOB)
    expect(usernames).not.toContain(CAROL)
  })

  it('does not include somebody who has only sent a request', async () => {
    const { app } = buildApp()
    await signIn(app, ALICE, BOB)
    await as(app, BOB).post('/api/friends/by-username').send({ username: usernameOf(ALICE) })

    expect((await board(app, ALICE)).map((e) => e.profile.userId)).not.toContain(BOB)
  })

  it('drops somebody who has been blocked', async () => {
    const { app } = buildApp()
    await signIn(app, ALICE, BOB)
    await befriend(app, ALICE, BOB)
    await as(app, ALICE).post(`/api/friends/${BOB}/block`)

    expect((await board(app, ALICE)).map((e) => e.profile.userId)).not.toContain(BOB)
  })

  it('marks your own row so the client can find it', async () => {
    const { app } = buildApp()
    await signIn(app, ALICE, BOB)
    await befriend(app, ALICE, BOB)

    const entries = await board(app, ALICE)
    expect(entries.filter((entry) => entry.isMe)).toHaveLength(1)
    expect(entries.find((entry) => entry.isMe)!.profile.userId).toBe(ALICE)
  })
})

describe('ranking', () => {
  it('puts whoever has solved most rooms first', async () => {
    const { app, gameRepository } = buildApp()
    await signIn(app, ALICE, BOB)
    await befriend(app, ALICE, BOB)

    await setProgress(gameRepository, ALICE, { solved: 1 })
    await setProgress(gameRepository, BOB, { solved: 3 })

    expect((await board(app, ALICE)).map((e) => e.profile.userId)).toEqual([BOB, ALICE])
  })

  it('breaks a tie on time, fastest first', async () => {
    const { app, gameRepository } = buildApp()
    await signIn(app, ALICE, BOB)
    await befriend(app, ALICE, BOB)

    await setProgress(gameRepository, ALICE, { solved: 4, finishedAfterMs: 90_000 })
    await setProgress(gameRepository, BOB, { solved: 4, finishedAfterMs: 60_000 })

    const entries = await board(app, ALICE)
    expect(entries.map((e) => e.profile.userId)).toEqual([BOB, ALICE])
    expect(entries[0]!.finishedInMs).toBe(60_000)
  })

  it('ranks a finished game above an unfinished one on equal rooms', async () => {
    const { app, gameRepository } = buildApp()
    await signIn(app, ALICE, BOB)
    await befriend(app, ALICE, BOB)

    await setProgress(gameRepository, ALICE, { solved: 2 })
    await setProgress(gameRepository, BOB, { solved: 2, finishedAfterMs: 10_000 })

    expect((await board(app, ALICE)).map((e) => e.profile.userId)).toEqual([BOB, ALICE])
  })

  it('breaks a remaining tie on fewest hints', async () => {
    const { app, gameRepository } = buildApp()
    await signIn(app, ALICE, BOB)
    await befriend(app, ALICE, BOB)

    await setProgress(gameRepository, ALICE, { solved: 2, hints: 5 })
    await setProgress(gameRepository, BOB, { solved: 2, hints: 1 })

    expect((await board(app, ALICE)).map((e) => e.profile.userId)).toEqual([BOB, ALICE])
  })

  it('is stable rather than dependent on query order', async () => {
    const { app, gameRepository } = buildApp()
    await signIn(app, ALICE, BOB, CAROL)
    await befriend(app, ALICE, BOB)
    await befriend(app, ALICE, CAROL)

    for (const user of [ALICE, BOB, CAROL]) {
      await setProgress(gameRepository, user, { solved: 1 })
    }

    const first = (await board(app, ALICE)).map((e) => e.profile.userId)
    const second = (await board(app, ALICE)).map((e) => e.profile.userId)
    expect(first).toEqual(second)
  })

  it('never reports a negative time', async () => {
    const { app, gameRepository } = buildApp()
    await signIn(app, ALICE)

    // A clock that went backwards between starting and finishing should not
    // produce a leaderboard entry that reads as less than no time at all.
    const game = (await gameRepository.findByUserId(ALICE))!
    await gameRepository.save({
      ...game,
      startedAt: new Date(10_000).toISOString(),
      finishedAt: new Date(0).toISOString(),
    })

    expect((await board(app, ALICE))[0]!.finishedInMs).toBe(0)
  })
})

describe('what the leaderboard exposes', () => {
  it('carries only public profile fields, never an email', async () => {
    const { app } = buildApp()
    await signIn(app, ALICE, BOB)
    await befriend(app, ALICE, BOB)

    const entries = await board(app, ALICE)
    for (const entry of entries) {
      expect(Object.keys(entry.profile).sort()).toEqual([
        'displayName',
        'imageUrl',
        'userId',
        'username',
      ])
    }
    expect(JSON.stringify(entries)).not.toMatch(/@.*\.(com|ch|org)/)
  })

  it('is never cached', async () => {
    const { app } = buildApp()
    await signIn(app, ALICE)

    const response = await as(app, ALICE).get('/api/leaderboard/friends')
    expect(response.headers['cache-control']).toMatch(/no-store/)
  })
})

/**
 * The global board, added in ADR-0034. Same rows, same order, different set of
 * people — so what is worth testing is who appears rather than how they rank.
 */
const globalBoard = async (app: Server, user: string): Promise<LeaderboardEntry[]> => {
  const response = await as(app, user).get('/api/leaderboard/global')
  expect(response.status).toBe(200)
  return response.body.entries as LeaderboardEntry[]
}

describe('the global leaderboard', () => {
  it('needs an account, like every other board', async () => {
    const { app } = buildApp()
    expect((await request(app).get('/api/leaderboard/global')).status).toBe(401)
  })

  it('shows people you have never met', async () => {
    const { app, gameRepository } = buildApp()
    await signIn(app, ALICE, BOB, CAROL)
    await setProgress(gameRepository, ALICE, { solved: 1 })
    await setProgress(gameRepository, BOB, { solved: 3 })
    await setProgress(gameRepository, CAROL, { solved: 2 })

    // Nobody is anybody's friend here, which is the whole point.
    const entries = await globalBoard(app, ALICE)
    expect(entries.map((entry) => entry.profile.userId)).toEqual([BOB, CAROL, ALICE])
  })

  it('marks your own row, whoever is asking', async () => {
    const { app, gameRepository } = buildApp()
    await signIn(app, ALICE, BOB)
    await setProgress(gameRepository, ALICE, { solved: 1 })
    await setProgress(gameRepository, BOB, { solved: 2 })

    expect((await globalBoard(app, ALICE)).find((entry) => entry.isMe)?.profile.userId).toBe(ALICE)
    expect((await globalBoard(app, BOB)).find((entry) => entry.isMe)?.profile.userId).toBe(BOB)
  })

  it('ranks by the same rule as the friends board', async () => {
    const { app, gameRepository } = buildApp()
    await signIn(app, ALICE, BOB, CAROL)
    await befriend(app, ALICE, BOB)
    await befriend(app, ALICE, CAROL)
    // Equal rooms, so the tie-breaks decide: finished beats unfinished, then
    // fewest hints.
    await setProgress(gameRepository, ALICE, { solved: 2, hints: 5 })
    await setProgress(gameRepository, BOB, { solved: 2, hints: 1 })
    await setProgress(gameRepository, CAROL, { solved: 2, finishedAfterMs: 60_000 })

    // A player must not be above somebody on one board and below them on the
    // other — the boards differ in who they include, never in how they order.
    const friends = (await board(app, ALICE)).map((entry) => entry.profile.userId)
    const everyone = (await globalBoard(app, ALICE)).map((entry) => entry.profile.userId)
    expect(everyone).toEqual(friends)
  })

  it('leaves out people who have not started playing', async () => {
    const { app, gameRepository } = buildApp()
    await signIn(app, ALICE)
    await setProgress(gameRepository, ALICE, { solved: 1 })

    // Bob has a profile — he signed up — but never opened a game. Listing him
    // last in a public ranking would say something untrue about him.
    await as(app, BOB).get('/api/profiles/me')

    const entries = await globalBoard(app, ALICE)
    expect(entries.map((entry) => entry.profile.userId)).not.toContain(BOB)
  })

  it('exposes nothing a friend list would not', async () => {
    const { app, gameRepository } = buildApp()
    await signIn(app, ALICE, BOB)
    await setProgress(gameRepository, ALICE, { solved: 1 })
    await setProgress(gameRepository, BOB, { solved: 2 })

    // The board is now visible to strangers, so this matters more than it did
    // when it was friends-only.
    for (const entry of await globalBoard(app, ALICE)) {
      expect(Object.keys(entry.profile).sort()).toEqual([
        'displayName',
        'imageUrl',
        'userId',
        'username',
      ])
      expect(JSON.stringify(entry)).not.toMatch(/@|email/i)
    }
  })
})

describe('the global board is a top ten', () => {
  /** Signs in `count` players and gives each strictly worse progress than the last. */
  async function crowd(app: Server, repository: InMemoryGameRepository, count: number) {
    const users = Array.from({ length: count }, (_, index) => `user_p${String(index).padStart(2, '0')}`)
    await signIn(app, ...users)
    for (const [index, user] of users.entries()) {
      // Same room count, increasing hints — so the order is fully determined.
      await setProgress(repository, user, { solved: 2, hints: index })
    }
    return users
  }

  it('returns ten rows when the leader is asking', async () => {
    const { app, gameRepository } = buildApp()
    const users = await crowd(app, gameRepository, 25)

    const entries = await globalBoard(app, users[0]!)
    expect(entries).toHaveLength(10)
    expect(entries.map((entry) => entry.rank)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
  })

  it('appends your own row when you are outside the ten', async () => {
    const { app, gameRepository } = buildApp()
    const users = await crowd(app, gameRepository, 25)

    // Twentieth-best, so nowhere near the top.
    const entries = await globalBoard(app, users[19]!)

    expect(entries).toHaveLength(11)
    expect(entries[10]?.isMe).toBe(true)
    expect(entries[10]?.profile.userId).toBe(users[19])
    // The real position, not the array index — showing "11" here would be a
    // confident, wrong number next to somebody's name.
    expect(entries[10]?.rank).toBe(20)
  })

  it('does not append twice when you are already in the ten', async () => {
    const { app, gameRepository } = buildApp()
    const users = await crowd(app, gameRepository, 25)

    const entries = await globalBoard(app, users[3]!)
    expect(entries).toHaveLength(10)
    expect(entries.filter((entry) => entry.isMe)).toHaveLength(1)
  })

  it('numbers the friends board too, from one', async () => {
    const { app, gameRepository } = buildApp()
    await signIn(app, ALICE, BOB)
    await befriend(app, ALICE, BOB)
    await setProgress(gameRepository, ALICE, { solved: 1 })
    await setProgress(gameRepository, BOB, { solved: 3 })

    expect((await board(app, ALICE)).map((entry) => entry.rank)).toEqual([1, 2])
  })
})
