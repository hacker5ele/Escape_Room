import { randomUUID } from 'node:crypto'
import {
  isGameComplete,
  MAX_GAME_EVENTS,
  MAX_LOGGED_ANSWER_LENGTH,
  type GameEvent,
  type GameSession,
  type RoomId,
} from '@escape-room/shared'
import type { GameRepository } from '../repositories/game.repository.js'
import type { Authenticator } from '../http/authenticator.js'

export class GameService {
  constructor(
    private readonly repository: GameRepository,
    private readonly authenticator: Authenticator,
  ) {}

  /**
   * Starts the caller's game, or hands back the one they already have.
   *
   * Idempotent on purpose: "start" and "resume" being the same operation
   * removes the race where two tabs each create a game and one silently wins.
   */
  async startOrResume(userId: string): Promise<GameSession> {
    const existing = await this.repository.findByUserId(userId)
    if (existing) return existing

    const now = new Date().toISOString()
    const game: GameSession = {
      id: randomUUID(),
      userId,
      playerName: await this.authenticator.displayName(userId),
      solvedRooms: [],
      startedAt: now,
      finishedAt: null,
      hintsUsed: 0,
      events: [{ at: now, type: 'game_started' }],
    }
    return this.repository.save(game)
  }

  async find(userId: string): Promise<GameSession | null> {
    return this.repository.findByUserId(userId)
  }

  /** Wipes progress so the player can replay from room one. */
  async reset(userId: string): Promise<void> {
    await this.repository.deleteByUserId(userId)
  }

  /**
   * Records the first time a player opens a room.
   *
   * Only the first — this runs on a read path, and logging every refresh would
   * both spam the history and turn a GET into a write.
   */
  async recordRoomEntered(game: GameSession, roomId: RoomId): Promise<GameSession> {
    const alreadySeen = game.events.some(
      (event) => event.type === 'room_entered' && event.roomId === roomId,
    )
    if (alreadySeen) return game

    return this.repository.save(append(game, { at: now(), type: 'room_entered', roomId }))
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
  ): Promise<GameSession> {
    const at = now()
    let updated = append(game, {
      at,
      type: 'attempt',
      roomId,
      correct,
      answer: describeAnswer(answer),
    })

    if (correct && !updated.solvedRooms.includes(roomId)) {
      updated = {
        ...updated,
        solvedRooms: [...updated.solvedRooms, roomId],
      }
      updated = append(updated, { at, type: 'room_solved', roomId })

      if (isGameComplete(updated) && updated.finishedAt === null) {
        updated = { ...updated, finishedAt: at }
        updated = append(updated, { at, type: 'game_completed' })
      }
    }

    return this.repository.save(updated)
  }

  async recordHintUsed(game: GameSession, roomId: RoomId): Promise<GameSession> {
    const updated = append({ ...game, hintsUsed: game.hintsUsed + 1 }, {
      at: now(),
      type: 'hint_taken',
      roomId,
    })
    return this.repository.save(updated)
  }
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
