import type { CharacterParts } from '@escape-room/shared'
import type { Directory } from '../http/directory.js'
import { composeInviteHero } from '../character/compose.js'
import { HERO_GROUND, HERO_WIDTH, inviteEmail } from './invite-email.js'
import type { Mailer } from './mail.service.js'

/**
 * Minting a party link, as a function rather than the whole service.
 *
 * `InviteService` needs `PartyService` to describe a party, and `PartyService`
 * needs this to send an email — a cycle if either held the other. Taking only
 * the one operation that is needed breaks it at its narrowest point, and says
 * plainly how little of the invite service this actually uses.
 */
export type MintPartyLink = (inviterUserId: string) => Promise<{ token: string }>

/**
 * Telling somebody who is not here that a friend wants them in the game.
 *
 * Everything this needs already exists and none of it is new machinery: the
 * link is the **party invite link from ADR-0042**, which befriends and joins in
 * one step, is revocable and expires; the address comes from the identity
 * provider and goes nowhere else; and the picture is the character the stage
 * already knows they are wearing.
 *
 * The only judgement here is that **an email must never break an invitation**.
 * The bell notification is already written by the time this runs, so a bounced
 * lookup, a missing address or SES having a bad afternoon is a courtesy that
 * did not arrive, not an action that failed.
 */
export class InviteMailService {
  constructor(
    private readonly mintLink: MintPartyLink,
    private readonly directory: Directory,
    private readonly mailer: Mailer,
    /** Where the link points. `https://cool.tf`, with no trailing slash. */
    private readonly origin: string,
  ) {}

  async emailQuietly(invite: {
    inviterUserId: string
    inviterName: string
    friendUserId: string
    character: CharacterParts | null
  }): Promise<void> {
    try {
      await this.#email(invite)
    } catch (error) {
      console.error('Could not email an invitation', {
        to: invite.friendUserId,
        error,
      })
    }
  }

  async #email({
    inviterUserId,
    inviterName,
    friendUserId,
    character,
  }: {
    inviterUserId: string
    inviterName: string
    friendUserId: string
    character: CharacterParts | null
  }): Promise<void> {
    const to = await this.directory.emailFor(friendUserId)
    // No verified address is not a failure, it is an answer. Nothing further to
    // do, and nothing to mint — an unused invite token is litter.
    if (!to) return

    const invite = await this.mintLink(inviterUserId)

    const heroCid = character ? this.mailer.cid('character') : null
    const hero = character ? await composeInviteHero(character, HERO_WIDTH, HERO_GROUND) : null

    const { subject, html, text } = inviteEmail({
      inviterName,
      link: `${this.origin}/invite/${invite.token}`,
      // A character naming parts that no longer exist cannot be drawn, and the
      // email is better without a picture than with a broken one.
      heroCid: hero && heroCid ? heroCid : null,
    })

    await this.mailer.send({
      to,
      subject,
      html,
      text,
      attachments:
        hero && heroCid
          ? [{ cid: heroCid, filename: 'character.png', contentType: 'image/png', data: hero }]
          : [],
    })
  }
}
