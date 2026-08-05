import { randomBytes } from 'node:crypto'
import { MAX_PARTY_SIZE, type Invite, type InvitePreview } from '@escape-room/shared'
import type { InviteRecord, InviteRepository } from '../repositories/invite.repository.js'
import type { ProfileService } from './profile.service.js'
import type { PartyService } from './party.service.js'
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
    /**
     * Optional so the friend-link half of this service works without it — the
     * party is only needed to describe a link that joins one.
     */
    private readonly party?: PartyService,
  ) {}

  async create(
    inviterUserId: string,
    options: { forParty?: boolean } = {},
    lifetimeDays = DEFAULT_LIFETIME_DAYS,
  ): Promise<Invite> {
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
      // The minter's own id, always. A link cannot invite somebody into a party
      // that is not the minter's to share.
      ...(options.forParty ? { partyHostUserId: inviterUserId } : {}),
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

    // Only a size and whether it is full. Who is in the party is not something
    // a stranger holding a link needs before deciding whether to follow it.
    const party = record.partyHostUserId
      ? await this.#partySize(record.partyHostUserId)
      : null

    return { inviter, party }
  }

  /**
   * How many people are in a party, host included.
   *
   * Returns null when the link was made for a party the inviter is no longer
   * hosting — they left their own game, or joined somebody else's. The link
   * then quietly becomes an ordinary friend link rather than an error, because
   * the friendship half of it is still perfectly good.
   */
  async #partySize(hostUserId: string): Promise<{ size: number; full: boolean } | null> {
    if (!this.party) return null
    if ((await this.party.hostOf(hostUserId)) !== hostUserId) return null

    const size = (await this.party.memberIdsOf(hostUserId)).length + 1
    return { size, full: size >= MAX_PARTY_SIZE }
  }

  /** Resolves a token to the person who made it, and counts the use. */
  /**
   * Spends the link.
   *
   * Returns the host to join as well as the friend to make, so the route can do
   * both in one step — which is the whole difference between a party link and a
   * friend link.
   */
  async accept(token: string): Promise<{ inviterUserId: string; partyHostUserId?: string }> {
    const record = await this.#require(token)
    await this.repository.recordUse(token)
    return {
      inviterUserId: record.inviterUserId,
      ...(record.partyHostUserId ? { partyHostUserId: record.partyHostUserId } : {}),
    }
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
    forParty: record.partyHostUserId !== undefined,
  }
}
