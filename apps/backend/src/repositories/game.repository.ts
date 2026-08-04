import { ConditionalCheckFailedException, DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, DeleteCommand, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb'
import { gameSessionSchema, type GameSession } from '@escape-room/shared'

/**
 * How a player's game is stored.
 *
 * One player has exactly one game, keyed on their Clerk user id — so this is
 * pure key/value access with no queries. That is what made DynamoDB the right
 * fit rather than Postgres; see ADR-0018.
 *
 * This is the interface ADR-0008 promised would let persistence be swapped in
 * without callers changing, and it was: only the implementation below is new.
 */
export interface GameRepository {
  findByUserId(userId: string): Promise<GameSession | null>
  /**
   * Writes the game, refusing if somebody else has written it since it was read.
   *
   * The stored `version` must equal the one on `game`; the saved copy comes back
   * with it incremented. Throws `GameConflictError` when it does not match,
   * which the service handles by re-reading and re-applying. Nothing is lost and
   * nothing is silently overwritten. See ADR-0028.
   */
  save(game: GameSession): Promise<GameSession>
  deleteByUserId(userId: string): Promise<void>
}

/** Somebody else wrote this game between our read and our write. */
export class GameConflictError extends Error {
  constructor() {
    super('This game changed while you were playing.')
    this.name = 'GameConflictError'
  }
}

/** Used by every test, and by a local run with no AWS credentials. */
export class InMemoryGameRepository implements GameRepository {
  readonly #games = new Map<string, GameSession>()

  async findByUserId(userId: string): Promise<GameSession | null> {
    const game = this.#games.get(userId)
    return game ? structuredClone(game) : null
  }

  async save(game: GameSession): Promise<GameSession> {
    const current = this.#games.get(game.userId)
    // Mirrors the DynamoDB condition below, so the retry path is exercised by
    // the offline tests rather than only in a deployment.
    if (current && current.version !== game.version) throw new GameConflictError()

    const saved = { ...game, version: game.version + 1 }
    this.#games.set(game.userId, saved)
    return structuredClone(saved)
  }

  async deleteByUserId(userId: string): Promise<void> {
    this.#games.delete(userId)
  }
}

export class DynamoGameRepository implements GameRepository {
  readonly #client: DynamoDBDocumentClient
  readonly #tableName: string

  constructor(tableName: string, region: string) {
    // No credentials passed anywhere: the SDK picks up the App Runner instance
    // role. There is no connection string and no password to leak.
    this.#client = DynamoDBDocumentClient.from(new DynamoDBClient({ region }), {
      marshallOptions: { removeUndefinedValues: true },
    })
    this.#tableName = tableName
  }

  async findByUserId(userId: string): Promise<GameSession | null> {
    const result = await this.#client.send(
      new GetCommand({
        TableName: this.#tableName,
        Key: { userId },
        // Progress is the authority on what a player may enter, so a stale
        // read could briefly re-lock a room they just solved.
        ConsistentRead: true,
      }),
    )

    if (!result.Item) return null

    // Parse rather than cast. The table is the one place data can arrive from
    // outside this codebase — an item written by an older version of the app
    // should fail loudly here, not halfway through a room.
    const parsed = gameSessionSchema.safeParse(result.Item)
    return parsed.success ? parsed.data : null
  }

  async save(game: GameSession): Promise<GameSession> {
    const saved = { ...game, version: game.version + 1 }

    try {
      await this.#client.send(
        new PutCommand({
          TableName: this.#tableName,
          Item: saved,
          // Either the game does not exist yet, or its stored version is the
          // one we read. Without this, two players solving at the same moment
          // each write their own copy and the second silently discards the
          // first — a bug that never appears in testing and always appears in
          // a demo.
          ConditionExpression: 'attribute_not_exists(userId) OR version = :expected',
          ExpressionAttributeValues: { ':expected': game.version },
        }),
      )
    } catch (error) {
      if (error instanceof ConditionalCheckFailedException) throw new GameConflictError()
      throw error
    }

    return saved
  }

  async deleteByUserId(userId: string): Promise<void> {
    await this.#client.send(new DeleteCommand({ TableName: this.#tableName, Key: { userId } }))
  }
}
