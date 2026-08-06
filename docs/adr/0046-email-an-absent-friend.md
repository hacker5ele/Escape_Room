# ADR-0046: Invite somebody who is not here, and they get an email

- **Status:** Accepted
- **Date:** 2026-08-06
- **Deciders:** Nepomuk Crhonek
- **Approved-by:** Nepomuk Crhonek, 2026-08-06
- **Amends:** [ADR-0042](0042-party-invites.md)

## Context

Inviting a friend from the lobby wrote a bell notification and stopped there. If their tab was
closed the invitation sat unread until they happened to come back — which for somebody who is not
playing today means never. The one action in the app whose entire purpose is to reach another person
could only reach the people who were already looking.

Since [ADR-0045](0045-membership-is-liveness.md) the server knows exactly who has the game open, so
the channel can be chosen by whether there is anybody there to read it.

## Decision

**Tell them in the app if they are here. Email them if they are not.**

Three questions, in order, and any of them false means the bell and nothing else:

1. **Are they live?** `LiveStore.isLive` — the same map that decides everything else about presence.
2. **Is there already an unread invitation from this person?** `hasUnreadFrom`, which chat built to
   avoid one bell per message and which is exactly the throttle this needs. **No new state**, and it
   clears itself the moment they read it. Asked *before* the new notification is written, or it is
   the thing we just added and the answer is always yes.
3. **Do they have a verified address?**

### Almost none of this is new

| what it needed | what it used |
| --- | --- |
| a link that joins the game | the **party link from ADR-0042** — befriends *and* joins in one step, revocable, expires |
| an address | `clerkClient.users.getUser`, already wired with a key already in SSM |
| a throttle | `hasUnreadFrom`, already there |
| knowing they are away | `LiveStore`, already there |
| a picture of the inviter | the character the **heartbeat** already reports |

The only genuinely new things are a sender and a template.

### Verified addresses only, and the address never leaves the server

Mailing an address an account never proved it owns is how somebody's typo becomes a stranger's
inbox — and an invitation naming a real person is exactly the sort of thing that should not arrive
there. `Directory` is deliberately separate from `Authenticator`: that one answers *who is calling*,
this one answers *how do I reach somebody who is not*. An address is looked up, put in an envelope
and forgotten. It is never cached, never stored, and never part of a profile.

### Amazon SES, and therefore no secret at all

The instance role is granted `ses:SendEmail` on one identity. There is no API key to create, store,
rotate or leak — which no other option offered. Verification is DKIM records in the Route53 zone the
project already manages, so it is Terraform rather than a console.

**Empty `MAIL_FROM` turns email off entirely.** Local development, the test suite and
`docker compose up` all run that way, so nothing sends by accident and nothing needs credentials.

### The character is composited on the server

The email shows the inviter's character, and **not** the avatar the identity provider holds. That
one is soft, and the reason is worth writing down because it is not where anybody would look: the
portrait is a 260-unit window blown up to 512, so it is **upscaled about twice before the identity
provider ever sees it**. The parts themselves are fine — a head is 154×190 — but the crop is not.

Drawing the whole standing figure sidesteps the crop entirely, and at the size an email uses it is
indistinguishable from a version reprocessed from the 1024px originals. So the shipped parts are
enough, and the 2× re-export that was on the table — every character asset in the repository
changing — turned out to be unnecessary.

Two consequences fall out of doing it here:

- **`pngjs`, not `sharp`.** Sharp is the obvious choice and the wrong one: the image is
  `node:22-alpine`, sharp on musl is a fight, and all this needs is alpha-over blending of four flat
  pictures. About fifty lines, no native binary.
- **The character and the starburst are composited into one picture.** Overlapping two images with a
  negative margin renders correctly in a browser and in nothing else, because Outlook lays email out
  with Word. One picture is one thing a mail client cannot get wrong.

The parts ship with the API as PNG — 450 KB, written by the same pipeline run that writes the web
assets, so the two cannot drift.

### An email must never break an invitation

The bell notification is already written by the time anything is sent. A missing address, a bounced
lookup or SES having a bad afternoon is a courtesy that did not arrive, not an action that failed.
There is a test for it.

### The design system is translated, not ported

Outlook renders with Word: no flex, no grid, no `backdrop-filter`, no `mix-blend-mode`, no CSS mask,
no webfont. What survives is the **inks**, because flat colour works everywhere, and the artwork,
which carries the halftone baked in rather than tiled by CSS — a background image on a table cell
needs VML there.

- The hard print shadow is **padding on a dark cell**, since `box-shadow` is ignored.
- Syne and Martian Mono cannot load; the brand is carried by the artwork instead of the type.
- **Most clients block remote images by default**, so the message and the button are text and every
  image has alt text. The character is an *inline attachment*, which is what makes it show anyway.
- The display name is escaped by hand. There is no React here, and it is somebody else's input.

## Consequences

**Good**

- The one action whose purpose is to reach another person can now reach them.
- No new secret, no new vendor, no new storage, no new endpoint, no contract change.
- The composited character is sharper than the avatar anywhere else in the app, and needed no change
  to how characters are made.

**Bad**

- **SES starts in a sandbox**: until AWS grants production access it delivers only to *verified*
  addresses, 200 a day. Verifying the four of us covers the demo completely; **production access is
  a support request that usually clears inside 24 hours and is not promised.**
- The API image grows by about 450 KB of artwork, and the API now has a reason to care what a
  character looks like — a coupling it did not have.
- Terraform needs a manual apply, as ever. CI validates and never applies.
- No unsubscribe. It is transactional and only ever sent to somebody who is already this person's
  friend, but a preference is the honest thing to add if this is ever sent for anything else.

**Notable**

- The throttle is "you already have an unread invitation from them", not a timer. It means somebody
  who reads and ignores an invitation can be invited again, which is right, and somebody who never
  opens the app gets exactly one, which is also right.

## Alternatives considered

**Emailing an address typed into a box**, to reach people with no account. It reuses the same
machinery and it turns the app into a way to send mail to strangers — which needs a daily cap, rate
limits, and an answer to "the recipient never asked to hear from us". The link can already be pasted
into any chat by the person who minted it.

**Resend, or another provider.** No sandbox, so it would mail anyone the moment the domain verified.
It also means a third-party account in a stack that is otherwise entirely AWS, an API key to create
and store, and somebody to own the vendor relationship. The sandbox restricts *recipients*, and for
this week the recipients are us.

**Emailing on every notification type** rather than invitations only. Chat would be unbearable, and
`room_solved` is nobody's business but the player's. Adding a type later is one condition.

**Linking the character rather than attaching it.** Simpler, and invisible in the clients that block
remote images — which is most of them, by default, for exactly the reason that a remote image in an
email is a tracking pixel.
