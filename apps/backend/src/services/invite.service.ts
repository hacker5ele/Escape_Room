import { randomBytes } from 'node:crypto'
import type { Invite, InvitePreview } from '@escape-room/shared'
import type { InviteRecord, InviteRepository } from '../repositories/invite.repository.js'
import type { ProfileService } from './profile.service.js'
import { ApiError } from '../http/api-error.js'

/**
 * 16 random bytes, base64url encoded — 22 characters, 128 bits of entropy.
 *
 * Long enough that guessing is not a strategy, and base64url means the token
 * survives being pasted into a URL, a chat message or a QR code without
 * escaping.
 */
function mintToken(): string {
  return randomBytes(16).toString('base64url')
}

/** A link stops working after this unless the owner picks otherwise. */
const DEFAULT_LIFETIME_DAYS = 7

export class InviteService {
  constructor(
    private readonly repository: InviteRepository,
    private readonly profiles: ProfileService,
  ) {}

  async create(inviterUserId: string, lifetimeDays = DEFAULT_LIFETIME_DAYS): Promise<Invite> {
    const now = new Date()
    const expires =
      lifetimeDays > 0 ? new Date(now.getTime() + lifetimeDays * 86_400_000) : null

    const record: InviteRecord = {
      token: mintToken(),
      inviterUserId,
      createdAt: now.toISOString(),
      expiresAt: expires ? expires.toISOString() : null,
      // DynamoDB's TTL reaper only understands epoch seconds, and it is
      // best-effort — it can lag by hours. The `expiresAt` check below is what
      // actually enforces expiry; TTL is only there to stop the table growing
      // forever.
      ...(expires ? { expiresAtEpoch: Math.floor(expires.getTime() / 1000) } : {}),
      revokedAt: null,
      useCount: 0,
    }

    await this.repository.create(record)
    return toInvite(record)
  }

  async listFor(inviterUserId: string): Promise<Invite[]> {
    const records = await this.repository.listFor(inviterUserId)
    return records
      .filter((record) => isUsable(record))
      .map(toInvite)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }

  /**
   * What a visitor sees before signing in.
   *
   * Unknown, revoked and expired all produce the same error on purpose. Telling
   * the difference would let somebody probing tokens learn which ones once
   * existed.
   */
  async preview(token: string): Promise<InvitePreview> {
    const record = await this.#require(token)
    const inviter = await this.profiles.findByUserId(record.inviterUserId)
    if (!inviter) throw ApiError.inviteInvalid()

    return { inviter }
  }

  /** Resolves a token to the person who made it, and counts the use. */
  async accept(token: string): Promise<string> {
    const record = await this.#require(token)
    await this.repository.recordUse(token)
    return record.inviterUserId
  }

  async revoke(token: string, ownerUserId: string): Promise<void> {
    const record = await this.repository.find(token)
    // Someone else's token reports the same error as a missing one, so this
    // cannot be used to test whether a token exists.
    if (!record || record.inviterUserId !== ownerUserId) {
      throw ApiError.inviteInvalid()
    }
    await this.repository.revoke(token, new Date().toISOString())
  }

  async #require(token: string): Promise<InviteRecord> {
    const record = token ? await this.repository.find(token) : null
    if (!record || !isUsable(record)) throw ApiError.inviteInvalid()
    return record
  }
}

function isUsable(record: InviteRecord): boolean {
  if (record.revokedAt) return false
  // Checked here rather than relying on DynamoDB's TTL, which is best-effort
  // and can leave an expired item readable for hours.
  if (record.expiresAt && Date.parse(record.expiresAt) <= Date.now()) return false
  return true
}

function toInvite(record: InviteRecord): Invite {
  return {
    token: record.token,
    createdAt: record.createdAt,
    expiresAt: record.expiresAt,
    useCount: record.useCount,
  }
}
