import type { GameSession } from '@escape-room/shared'

/**
 * How sessions are stored.
 *
 * Every method is async even though the in-memory implementation never awaits
 * anything. That is deliberate: when we decide on real persistence
 * (ADR-0008 leaves it open), a database-backed implementation drops in without
 * a single caller changing. Do not add synchronous shortcuts — that would turn
 * a deferred decision into a permanent one by accident.
 */
export interface SessionRepository {
  create(session: GameSession): Promise<GameSession>
  findById(id: string): Promise<GameSession | null>
  save(session: GameSession): Promise<GameSession>
}

export class InMemorySessionRepository implements SessionRepository {
  readonly #sessions = new Map<string, GameSession>()

  async create(session: GameSession): Promise<GameSession> {
    this.#sessions.set(session.id, session)
    return structuredClone(session)
  }

  async findById(id: string): Promise<GameSession | null> {
    const session = this.#sessions.get(id)
    return session ? structuredClone(session) : null
  }

  async save(session: GameSession): Promise<GameSession> {
    this.#sessions.set(session.id, session)
    return structuredClone(session)
  }
}
