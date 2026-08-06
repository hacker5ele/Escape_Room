import { describe, expect, it } from 'vitest'
import { buildMimeMessage } from './mail.service.js'
import { inviteEmail } from './invite-email.js'

/**
 * The email, as text.
 *
 * Every assertion here is about something a mail client would get wrong
 * silently: a nesting that turns the character into a paperclip, a name that
 * arrives as markup, a message with no plain-text part.
 */

const LINK = 'https://cool.tf/invite/8f3a2c1d9b7e4a6f'

describe('the invitation', () => {
  it('escapes the name, because it is somebody else’s input', () => {
    // There is no React here to do it, and a display name is typed by a person
    // who may not be friendly.
    const { html } = inviteEmail({
      inviterName: '<script>alert(1)</script>',
      link: LINK,
      heroCid: null,
    })

    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
  })

  it('carries the link in the plain-text part as well', () => {
    // A client that renders no HTML still has to be able to accept, and a
    // message with no text part reads as spam to most filters.
    const { text } = inviteEmail({ inviterName: 'Nepomuk', link: LINK, heroCid: null })
    expect(text).toContain(LINK)
  })

  it('says what it is about without loading a single image', () => {
    // Most clients block remote images by default. An email whose content is a
    // picture is an empty rectangle to most of the people who get it.
    const { html } = inviteEmail({ inviterName: 'Nepomuk', link: LINK, heroCid: 'hero@cool.tf' })
    const withoutImages = html.replace(/<img[^>]*>/g, '')

    expect(withoutImages).toContain('Nepomuk')
    expect(withoutImages).toContain('JOIN THE GAME')
    expect(withoutImages).toContain(LINK)
  })

  it('gives every image alt text', () => {
    const { html } = inviteEmail({ inviterName: 'Nepomuk', link: LINK, heroCid: 'hero@cool.tf' })
    for (const tag of html.match(/<img[^>]*>/g) ?? []) {
      expect(tag).toMatch(/alt="/)
    }
  })

  it('leaves the picture out rather than referencing one that is not there', () => {
    const { html } = inviteEmail({ inviterName: 'Nepomuk', link: LINK, heroCid: null })
    expect(html).not.toContain('cid:')
    expect(html).toContain('Nepomuk')
  })

  it('uses no technique the design system relies on and email cannot do', () => {
    // Outlook lays messages out with Word. Any of these silently collapses the
    // layout, which is the failure that looks like nothing went wrong.
    const { html } = inviteEmail({ inviterName: 'Nepomuk', link: LINK, heroCid: 'hero@cool.tf' })
    for (const forbidden of [
      'display:flex',
      'display:grid',
      'backdrop-filter',
      'mix-blend-mode',
      'box-shadow',
    ]) {
      expect(html).not.toContain(forbidden)
    }
  })
})

describe('the envelope', () => {
  const mail = {
    to: 'friend@example.com',
    subject: 'Nepomuk left a door open for you',
    html: '<p>hello <img src="cid:hero@cool.tf"></p>',
    text: 'hello',
    attachments: [
      {
        cid: 'hero@cool.tf',
        filename: 'character.png',
        contentType: 'image/png',
        data: Buffer.from([0x89, 0x50, 0x4e, 0x47]),
      },
    ],
  }

  it('nests the picture inside the HTML, not beside it', () => {
    // `alternative` of [text, `related` of [html, image]]. The other way round
    // makes the image a sibling of the text, and clients show it as a paperclip
    // instead of drawing it in the message.
    const raw = buildMimeMessage('Escape Room <noreply@cool.tf>', mail).toString('utf8')

    const alternative = raw.indexOf('multipart/alternative')
    const plain = raw.indexOf('text/plain')
    const related = raw.indexOf('multipart/related')
    const html = raw.indexOf('text/html')
    const image = raw.indexOf('image/png')

    expect(alternative).toBeLessThan(plain)
    expect(plain).toBeLessThan(related)
    expect(related).toBeLessThan(html)
    expect(html).toBeLessThan(image)
  })

  it('marks the picture inline and gives it the id the HTML asks for', () => {
    const raw = buildMimeMessage('Escape Room <noreply@cool.tf>', mail).toString('utf8')
    expect(raw).toContain('Content-ID: <hero@cool.tf>')
    expect(raw).toContain('Content-Disposition: inline; filename="character.png"')
  })

  it('encodes a subject that is not plain ASCII', () => {
    const raw = buildMimeMessage('x@cool.tf', {
      ...mail,
      subject: 'Nepomuk läßt dich rein',
    }).toString('utf8')
    // Raw UTF-8 in a header is not legal and arrives as mojibake.
    expect(raw).toContain('Subject: =?UTF-8?B?')
    expect(raw).not.toContain('Subject: Nepomuk läßt')
  })

  it('leaves a plain ASCII subject alone, because encoding one helps nobody', () => {
    const raw = buildMimeMessage('x@cool.tf', mail).toString('utf8')
    expect(raw).toContain('Subject: Nepomuk left a door open for you')
  })

  it('separates headers with CRLF, which is the only thing SMTP accepts', () => {
    const raw = buildMimeMessage('x@cool.tf', mail).toString('utf8')
    expect(raw).toContain('\r\n')
    expect(raw.split('\r\n').every((line) => !line.includes('\n'))).toBe(true)
  })

  it('closes every boundary it opens', () => {
    const raw = buildMimeMessage('x@cool.tf', mail).toString('utf8')
    const boundaries = [...raw.matchAll(/boundary="([^"]+)"/g)].map((m) => m[1])

    expect(boundaries).toHaveLength(2)
    for (const boundary of boundaries) {
      expect(raw).toContain(`--${boundary}--`)
    }
  })
})
