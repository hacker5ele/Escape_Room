import { describe, expect, it } from 'vitest'
import { ROOM_IDS, type GameSession, type RoomId } from '@escape-room/shared'
import { getRoom, ORDERED_ROOMS, ROOMS } from './index.js'
import { SOLUTIONS } from './solutions.fixture.js'

/**
 * Rooms where the fixture "solution" is a choice letter (A-D) rather than a
 * value computed from the puzzle. For these, the correct option's text is
 * necessarily visible in `publicData()` as one of the choices shown to the
 * player — that is not a leak, unlike rooms 1/2/4 where the solution is a
 * derived value that never needs to appear verbatim on screen. What must
 * still never leak is *which* letter is correct.
 */
const MULTIPLE_CHOICE_ROOMS: readonly RoomId[] = ['room-03']

const freshSession: GameSession = {
  id: '00000000-0000-4000-8000-000000000000',
  userId: 'user_tester',
  username: 'tester',
  playerName: 'Tester',
  solvedRooms: [],
  startedAt: new Date(0).toISOString(),
  finishedAt: null,
  hintsUsed: 0,
  events: [],
}

/** Walks an object tree and returns every key it contains. */
function collectKeys(value: unknown, found: string[] = []): string[] {
  if (Array.isArray(value)) {
    for (const entry of value) collectKeys(entry, found)
  } else if (typeof value === 'object' && value !== null) {
    for (const [key, entry] of Object.entries(value)) {
      found.push(key)
      collectKeys(entry, found)
    }
  }
  return found
}

describe('room registry', () => {
  it('implements every room declared in the shared contract', () => {
    expect(Object.keys(ROOMS).sort()).toEqual([...ROOM_IDS].sort())
    expect(ORDERED_ROOMS).toHaveLength(ROOM_IDS.length)
  })

  it('keeps the registry in the order the shared contract declares', () => {
    expect(ORDERED_ROOMS.map((room) => room.id)).toEqual([...ROOM_IDS])
  })

  it('gives every room an id matching its registry key', () => {
    for (const roomId of ROOM_IDS) {
      expect(getRoom(roomId).id).toBe(roomId)
    }
  })

  it('has a solutions fixture covering every room', () => {
    expect(Object.keys(SOLUTIONS).sort()).toEqual([...ROOM_IDS].sort())
  })
})

describe.each(ROOM_IDS)('%s', (roomId: RoomId) => {
  const room = getRoom(roomId)
  const solution = SOLUTIONS[roomId]

  it('accepts its solution', () => {
    expect(room.check(solution, freshSession).correct).toBe(true)
  })

  it('rejects a wrong answer', () => {
    expect(room.check('certainly-not-the-answer', freshSession).correct).toBe(false)
  })

  it('rejects hostile input types without throwing', () => {
    for (const hostile of [null, undefined, {}, [], true, Number.NaN, Infinity, () => 'x']) {
      expect(() => room.check(hostile, freshSession)).not.toThrow()
      expect(room.check(hostile, freshSession).correct).toBe(false)
    }
  })

  it('has at least one hint and a prompt', () => {
    expect(room.hints.length).toBeGreaterThan(0)
    expect(room.prompt.trim()).not.toBe('')
    expect(room.title.trim()).not.toBe('')
  })

  /**
   * The important one. Everything `publicData` returns reaches the browser,
   * where the player can read it. If a solution ends up in there, the room is
   * decorative — see ADR-0006.
   */
  if (MULTIPLE_CHOICE_ROOMS.includes(roomId)) {
    it('never reveals which choice is correct', () => {
      const keys = collectKeys(room.publicData(freshSession))
      // A room-level "this option is right" field would be the actual leak —
      // the option text itself is meant to be visible, since the player
      // chooses from it.
      for (const key of keys) {
        expect(key).not.toMatch(/correct/i)
      }
    })
  } else {
    it('never ships its solution to the browser', () => {
      const serialized = JSON.stringify(room.publicData(freshSession))
      expect(serialized).not.toContain(String(solution))
    })
  }

  it('never ships a field that looks like an answer', () => {
    const keys = collectKeys(room.publicData(freshSession))
    for (const key of keys) {
      expect(key).not.toMatch(/solution|answer|secret|password/i)
    }
  })

  it('never ships its hints up front', () => {
    const serialized = JSON.stringify(room.publicData(freshSession))
    for (const hint of room.hints) {
      expect(serialized).not.toContain(hint)
    }
  })
})
