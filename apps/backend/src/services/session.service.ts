import { randomUUID } from 'node:crypto'
import { isGameComplete, type GameSession, type RoomId } from '@escape-room/shared'
import type { SessionRepository } from '../repositories/session.repository.js'
import { ApiError } from '../http/api-error.js'

export class SessionService {
  constructor(private readonly repository: SessionRepository) {}

  async create(playerName: string): Promise<GameSession> {
    const session: GameSession = {
      // randomUUID, not a counter: a guessable session id would let anyone
      // read or advance someone else's game.
      id: randomUUID(),
      playerName,
      solvedRooms: [],
      startedAt: new Date().toISOString(),
      finishedAt: null,
      hintsUsed: 0,
    }
    return this.repository.create(session)
  }

  /** Loads a session or fails the request. Sessions are gone after a restart — see ADR-0008. */
  async require(sessionId: string): Promise<GameSession> {
    const session = await this.repository.findById(sessionId)
    if (!session) throw ApiError.sessionNotFound()
    return session
  }

  async markSolved(session: GameSession, roomId: RoomId): Promise<GameSession> {
    if (session.solvedRooms.includes(roomId)) return session

    const updated: GameSession = {
      ...session,
      solvedRooms: [...session.solvedRooms, roomId],
    }
    if (isGameComplete(updated) && updated.finishedAt === null) {
      updated.finishedAt = new Date().toISOString()
    }
    return this.repository.save(updated)
  }

  async recordHintUsed(session: GameSession): Promise<GameSession> {
    return this.repository.save({ ...session, hintsUsed: session.hintsUsed + 1 })
  }
}
