/**
 * "Somebody left a door open for you."
 *
 * The design system cannot be ported into an email, only translated. Outlook
 * lays messages out with Word, so there is no flex, no grid, no
 * `backdrop-filter`, no `mix-blend-mode`, no CSS mask and no webfont. What
 * survives is the *inks* — they are flat colour and flat colour works
 * everywhere — and the artwork, which carries the halftone baked in rather than
 * tiled by CSS, because a background image on a table cell needs VML in Outlook.
 *
 * Three things here are deliberate and easy to undo by accident:
 *
 * - **The hard print shadow is padding on a dark cell**, not `box-shadow`,
 *   which Outlook ignores outright.
 * - **The character arrives as one composited picture**, not a figure layered
 *   over a starburst with a negative margin. That works in a browser and in
 *   nothing else.
 * - **The message and the button are text.** Most clients block remote images
 *   by default, so an email whose content is a picture is an empty rectangle to
 *   most of the people who receive it. The character is an inline attachment,
 *   which is what makes it show up anyway.
 */

const PANEL = '#F6F2E6'
const PAPER = '#EDE7D6'
const SIGNAL = '#E8452E'
const KEY = '#18160F'
const MUTED = '#5C574C'

const DISPLAY = "'Helvetica Neue',Helvetica,Arial,sans-serif"
const MONO = "'Courier New',Courier,monospace"

/** The ground the hero is flattened onto. It sits on the panel, not the page. */
export const HERO_GROUND: [number, number, number] = [0xf6, 0xf2, 0xe6]
/** Twice its display width, so it is not soft on a retina screen. */
export const HERO_WIDTH = 620

export interface InviteEmail {
  subject: string
  html: string
  text: string
}

/**
 * There is no React here to do this, and a display name is somebody else's
 * input. Everything interpolated below goes through it.
 */
function escape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function inviteEmail({
  inviterName,
  link,
  heroCid,
}: {
  inviterName: string
  link: string
  /** Null when the character could not be drawn — the email still works. */
  heroCid: string | null
}): InviteEmail {
  const who = escape(inviterName)
  const href = escape(link)

  const hero = heroCid
    ? `<tr><td align="center" style="padding:22px 26px 0;">` +
      `<img src="cid:${escape(heroCid)}" width="310" alt="${who}&#39;s character" ` +
      `style="display:block;border:0;width:310px;max-width:86%;height:auto;" /></td></tr>`
    : ''

  const html =
    `<!doctype html><html><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width,initial-scale=1">` +
    // Asks the client not to invert for dark mode. Some still will; nothing
    // wins that outright, so every colour below is stated rather than inherited.
    `<meta name="color-scheme" content="light only">` +
    `<meta name="supported-color-schemes" content="light only">` +
    `<title>An invitation</title></head>` +
    `<body style="margin:0;padding:0;background:${PAPER};">` +
    // The grey line a client shows next to the subject.
    `<div style="display:none;max-height:0;overflow:hidden;opacity:0;">` +
    `${who} is waiting for you in the escape room.</div>` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" ` +
    `style="background:${PAPER};"><tr><td align="center" style="padding:28px 12px;">` +
    // The panel, with its shadow as padding on a dark cell.
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>` +
    `<td style="background:${KEY};padding:0 5px 5px 0;">` +
    `<table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" ` +
    `style="width:560px;max-width:100%;background:${PANEL};border:2px solid ${KEY};">` +
    `<tr><td style="background:${SIGNAL};padding:14px 26px;border-bottom:2px solid ${KEY};">` +
    `<div style="font-family:${DISPLAY};font-size:13px;font-weight:bold;letter-spacing:0.22em;` +
    `color:${PANEL};">DER DIGITALE ESCAPE ROOM</div></td></tr>` +
    hero +
    `<tr><td align="center" style="padding:6px 30px 0;">` +
    `<h1 style="margin:0;font-family:${DISPLAY};font-size:31px;line-height:1.08;font-weight:bold;` +
    `letter-spacing:-0.02em;color:${KEY};">${who} has left<br>a door open for you</h1>` +
    `<p style="margin:14px 0 0;font-family:${MONO};font-size:14px;line-height:1.65;color:${MUTED};">` +
    `They are in the waiting room now.<br>Four people fit; one of them could be you.</p></td></tr>` +
    `<tr><td align="center" style="padding:26px 30px 34px;">` +
    // Table-based, because a styled anchor alone collapses in Outlook.
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>` +
    `<td style="background:${SIGNAL};border:2px solid ${KEY};">` +
    `<a href="${href}" style="display:block;padding:15px 30px;font-family:${DISPLAY};` +
    `font-size:16px;font-weight:bold;letter-spacing:0.08em;color:${PANEL};` +
    `text-decoration:none;">JOIN THE GAME</a></td></tr></table></td></tr>` +
    `</table></td></tr></table>` +
    `<p style="margin:22px 0 0;font-family:${MONO};font-size:11px;line-height:1.6;` +
    `color:${MUTED};max-width:520px;">` +
    `You are getting this because ${who} is a friend of yours in Der digitale Escape Room, ` +
    `and you were not online to be told in the app.<br>` +
    `<a href="${href}" style="color:${MUTED};">${href}</a></p>` +
    `</td></tr></table></body></html>`

  // Required, and not a formality: a client that renders no HTML still has to
  // be able to accept, and a message with no text part reads as spam.
  const text =
    `${inviterName} has left a door open for you.\n\n` +
    `They are in the waiting room of Der digitale Escape Room right now.\n` +
    `Four people fit; one of them could be you.\n\n` +
    `Join them:\n\n  ${link}\n\n--\n` +
    `You are getting this because ${inviterName} is a friend of yours and you were\n` +
    `not online to be told in the app.\n`

  return { subject: `${inviterName} left a door open for you`, html, text }
}
