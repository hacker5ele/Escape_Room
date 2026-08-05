import { ConditionalCheckFailedException, DynamoDBClient } from '@aws-sdk/client-dynamodb'
import {
  BatchGetCommand,
  DynamoDBDocumentClient,
  DeleteCommand,
  GetCommand,
  PutCommand,
} from '@aws-sdk/lib-dynamodb'
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
   * Several games in one round trip, for the leaderboards.
   *
   * The board needs everybody's progress at once, and asking for it one key at
   * a time meant up to two hundred separate reads for a single page — which is
   * exactly as slow as it sounds. Missing games are simply absent from the
   * result rather than null entries: somebody who has not started is not a gap
   * in a list, they are not in it.
   */
  findManyByUserId(userIds: string[]): Promise<GameSession[]>
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
    if (!game) return null

    // Mirrors what the schema does on a real read: a row written before
    // versioning existed has no `version`, and it reads back as zero.
    const clone = structuredClone(game)
    return { ...clone, version: clone.version ?? 0 }
  }

  async findManyByUserId(userIds: string[]): Promise<GameSession[]> {
    const found = await Promise.all(userIds.map((userId) => this.findByUserId(userId)))
    return found.filter((game): game is GameSession => game !== null)
  }

  /**
   * Writes a game exactly as given, without the version check or the bump.
   *
   * Test support: `save` always writes a version, so it cannot express a row
   * that predates versioning — which is precisely the state that needs
   * covering, because it is what every existing player's game looks like.
   */
  seed(game: GameSession): void {
    this.#games.set(game.userId, structuredClone(game))
  }

  async save(game: GameSession): Promise<GameSession> {
    const current = this.#games.get(game.userId)
    // Mirrors the DynamoDB condition below, so the retry path is exercised by
    // the offline tests rather than only in a deployment — including the
    // legacy case where the stored game predates `version` and has none.
    const storedVersion = current === undefined ? undefined : current.version
    if (storedVersion !== undefined && storedVersion !== game.version) {
      throw new GameConflictError()
    }

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

  async findManyByUserId(userIds: string[]): Promise<GameSession[]> {
    if (userIds.length === 0) return []

    // BatchGetItem takes at most 100 keys and rejects duplicates outright — a
    // repeated id would fail the whole request rather than just that entry.
    const unique = [...new Set(userIds)]
    const batches: string[][] = []
    for (let i = 0; i < unique.length; i += 100) {
      batches.push(unique.slice(i, i + 100))
    }

    const results = await Promise.all(
      batches.map(async (batch) => {
        const result = await this.#client.send(
          new BatchGetCommand({
            RequestItems: {
              // Deliberately not a consistent read, unlike `findByUserId`.
              // That one guards what a player may enter, so a stale read could
              // re-lock a room they just solved; this only feeds a leaderboard,
              // where a row a second out of date costs nothing and a consistent
              // batch costs twice as much.
              [this.#tableName]: { Keys: batch.map((userId) => ({ userId })) },
            },
          }),
        )
        return result.Responses?.[this.#tableName] ?? []
      }),
    )

    return results
      .flat()
      .map((item) => gameSessionSchema.safeParse(item))
      .filter((parsed) => parsed.success)
      .map((parsed) => parsed.data)
  }

  async save(game: GameSession): Promise<GameSession> {
    const saved = { ...game, version: game.version + 1 }

    try {
      await this.#client.send(
        new PutCommand({
          TableName: this.#tableName,
          Item: saved,
          // Three cases, and the middle one is the reason this is not a
          // one-liner. Either the game does not exist yet; or it was written
          // before `version` existed, so the attribute is absent and comparing
          // it to anything is false; or its stored version is the one we read.
          //
          // Without the middle clause every game created before this deployed
          // conflicts on every write, retries twice, and 409s — the player's
          // game stops working entirely and nothing in an offline test catches
          // it, because an in-memory game always has the field.
          ConditionExpression:
            'attribute_not_exists(userId) OR attribute_not_exists(version) OR version = :expected',
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
