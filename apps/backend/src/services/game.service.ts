import { randomUUID } from 'node:crypto'
import {
  isGameComplete,
  MAX_GAME_EVENTS,
  MAX_LOGGED_ANSWER_LENGTH,
  type GameEvent,
  type GameSession,
  type RoomId,
} from '@escape-room/shared'
import { GameConflictError, type GameRepository } from '../repositories/game.repository.js'
import type { PartyRepository } from '../repositories/party.repository.js'
import type { PlayerProfile } from '../http/authenticator.js'
import { ApiError } from '../http/api-error.js'

/**
 * How many times a write is re-attempted when somebody else got there first.
 *
 * Two is enough for two players in a room together; a third conflict in a row
 * means something is genuinely wrong and should surface rather than spin.
 */
const MAX_WRITE_ATTEMPTS = 3

/**
 * Owns games. Knows nothing about how a player was identified — the profile is
 * handed in, so Clerk and the local development mode look identical from here.
 *
 * Since co-op, it also owns the indirection from "this player" to "the game
 * this player is in", which may be somebody else's.
 */
export class GameService {
  constructor(
    private readonly repository: GameRepository,
    /** Absent means solo play only — every player is their own host. */
    private readonly party?: PartyRepository,
  ) {}

  /**
   * Whose game this player is in.
   *
   * Their own unless they have joined somebody else's. This is the whole of the
   * co-op indirection: everything above it asks for "this player's game" and
   * gets the party's, without knowing a party exists. See ADR-0028.
   */
  async hostFor(userId: string): Promise<string> {
    const membership = await this.party?.find(userId)
    return membership?.hostUserId ?? userId
  }

  /**
   * Starts the caller's game, or hands back the one they already have.
   *
   * Idempotent on purpose: "start" and "resume" being the same operation
   * removes the race where two tabs each create a game and one silently wins.
   */
  async startOrResume(userId: string, profile: PlayerProfile): Promise<GameSession> {
    // Somebody in a party resumes the party's game, not a private one.
    const hostUserId = await this.hostFor(userId)
    const existing = await this.repository.findByUserId(hostUserId)
    if (existing) return existing

    if (hostUserId !== userId) {
      // The host left or reset since we joined. Falling back to our own game is
      // better than reporting an error nobody can act on — but it has to be
      // the game we already had, not a new one written over the top of it.
      await this.party?.remove(userId)

      const own = await this.repository.findByUserId(userId)
      if (own) return own
    }

    // Enforced here rather than in the UI, so skipping the form achieves
    // nothing.
    //
    // The username is the player's public identity — what a leaderboard shows —
    // so a game without one is an entry we could never label. The name is
    // checked too rather than quietly falling back to the username: a silent
    // fallback would mean nobody ever notices that Clerk stopped asking for it.
    if (!profile.username || !profile.firstName || !profile.lastName) {
      throw ApiError.profileIncomplete()
    }

    const timestamp = now()
    const game: GameSession = {
      id: randomUUID(),
      userId,
      username: profile.username,
      playerName: `${profile.firstName} ${profile.lastName}`,
      solvedRooms: [],
      startedAt: timestamp,
      finishedAt: null,
      hintsUsed: 0,
      events: [{ at: timestamp, type: 'game_started' }],
      version: 0,
    }
    return this.repository.save(game)
  }

  async find(userId: string): Promise<GameSession | null> {
    return this.repository.findByUserId(await this.hostFor(userId))
  }

  /**
   * Wipes progress so the player can replay from room one.
   *
   * Only ever your own game. Someone in a party who resets leaves it first, so
   * they cannot delete the progress of everybody else playing with them.
   */
  async reset(userId: string): Promise<void> {
    await this.party?.remove(userId)
    await this.repository.deleteByUserId(userId)
  }

  /**
   * Records the first time a player opens a room.
   *
   * Only the first — this runs on a read path, and logging every refresh would
   * both spam the history and turn a GET into a write.
   */
  async recordRoomEntered(
    game: GameSession,
    roomId: RoomId,
    actor?: Actor,
  ): Promise<GameSession> {
    const alreadySeen = game.events.some(
      (event) => event.type === 'room_entered' && event.roomId === roomId,
    )
    if (alreadySeen) return game

    return this.#mutate(game, (current) =>
      current.events.some((event) => event.type === 'room_entered' && event.roomId === roomId)
        ? null
        : append(current, { at: now(), type: 'room_entered', roomId, ...by(actor) }),
    )
  }

  /**
   * Logs an answer and, when it is right, marks the room solved — in one save.
   *
   * Combined deliberately: writing the event and the progress separately would
   * mean two round trips per attempt and a window where the log and the
   * progress disagree.
   */
  async applyAttempt(
    game: GameSession,
    roomId: RoomId,
    answer: unknown,
    correct: boolean,
    actor?: Actor,
  ): Promise<GameSession> {
    // Re-applied against whatever the game looks like at write time, so a
    // teammate solving another room concurrently does not lose either result.
    // Whether the answer was right was decided before this call and does not
    // change; the room's `check()` is pure.
    return this.#mutate(game, (current) => {
      const at = now()
      let updated = append(current, {
        at,
        type: 'attempt',
        roomId,
        correct,
        answer: describeAnswer(answer),
        ...by(actor),
      })

      if (correct && !updated.solvedRooms.includes(roomId)) {
        updated = { ...updated, solvedRooms: [...updated.solvedRooms, roomId] }
        updated = append(updated, { at, type: 'room_solved', roomId, ...by(actor) })

        if (isGameComplete(updated) && updated.finishedAt === null) {
          updated = { ...updated, finishedAt: at }
          updated = append(updated, { at, type: 'game_completed' })
        }
      }

      return updated
    })
  }

  async recordHintUsed(game: GameSession, roomId: RoomId, actor?: Actor): Promise<GameSession> {
    return this.#mutate(game, (current) =>
      append({ ...current, hintsUsed: current.hintsUsed + 1 }, {
        at: now(),
        type: 'hint_taken',
        roomId,
        ...by(actor),
      }),
    )
  }

  /**
   * Applies a change, re-applying it against a fresh read if somebody else
   * wrote first.
   *
   * Retried rather than reported because the alternative — a 409 on a correct
   * answer because a teammate happened to solve something at the same instant —
   * is a worse experience than one extra read. Every mutation here is either
   * append-only or a set union, so re-applying is safe.
   *
   * A mutation may return null to mean "nothing to do after all", which
   * `recordRoomEntered` uses when the re-read shows the event already landed.
   */
  async #mutate(
    game: GameSession,
    mutate: (current: GameSession) => GameSession | null,
  ): Promise<GameSession> {
    let current = game

    for (let attempt = 0; attempt < MAX_WRITE_ATTEMPTS; attempt += 1) {
      const updated = mutate(current)
      if (updated === null) return current

      try {
        return await this.repository.save(updated)
      } catch (error) {
        if (!(error instanceof GameConflictError)) throw error

        const fresh = await this.repository.findByUserId(game.userId)
        // Deleted underneath us — a reset, most likely. Nothing to write to.
        if (!fresh) throw ApiError.sessionNotFound()
        current = fresh
      }
    }

    throw new ApiError(
      409,
      'GAME_CONFLICT',
      'Somebody else is playing this game at the same moment. Try that again.',
    )
  }
}

/** Who is acting, when a game is shared. */
export interface Actor {
  userId: string
  name: string
}

/** Stamps an event with its actor, or with nothing at all in a solo game. */
function by(actor: Actor | undefined) {
  return actor ? { actorUserId: actor.userId, actorName: actor.name } : {}
}

function now(): string {
  return new Date().toISOString()
}

/** Appends an event, dropping the oldest once the log is full. */
function append(game: GameSession, event: GameEvent): GameSession {
  const events = [...game.events, event]
  return {
    ...game,
    events: events.length > MAX_GAME_EVENTS ? events.slice(-MAX_GAME_EVENTS) : events,
  }
}

/**
 * Turns whatever the client sent into something safe to store.
 *
 * The answer is untrusted input, so it is stringified and truncated — an
 * unbounded value here would be a way to push the item past DynamoDB's 400 KB
 * limit and break the player's whole game.
 */
function describeAnswer(answer: unknown): string {
  const text =
    typeof answer === 'string'
      ? answer
      : typeof answer === 'number' || typeof answer === 'boolean'
        ? String(answer)
        : JSON.stringify(answer) ?? String(answer)

  return text.slice(0, MAX_LOGGED_ANSWER_LENGTH)
}
