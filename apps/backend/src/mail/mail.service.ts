import { randomUUID } from 'node:crypto'
import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2'

/**
 * Sending an email, and mostly not sending one.
 *
 * **Absent configuration means off.** No `MAIL_FROM` and every send is a no-op
 * that returns quietly — which is what lets the test suite and local
 * development run with no credentials, no network and no surprises in somebody's
 * inbox. The same "a missing collaborator disables the feature" shape the
 * notification service already has.
 *
 * The message is built by hand rather than with a library because the only
 * thing it needs that a plain body does not is one inline image, and SES takes
 * raw MIME for that. A dependency here would be four hundred kilobytes to avoid
 * forty lines.
 */

export interface Attachment {
  cid: string
  filename: string
  contentType: string
  data: Buffer
}

export interface Mail {
  to: string
  subject: string
  html: string
  text: string
  attachments?: Attachment[]
}

export interface Mailer {
  send(mail: Mail): Promise<void>
  /** A Content-ID unique to this message, for referencing an inline image. */
  cid(label: string): string
}

/** Wraps at 76 characters with CRLF, which is what RFC 2045 asks for. */
function base64Body(data: Buffer): string {
  return (data.toString('base64').match(/.{1,76}/g) ?? []).join('\r\n')
}

/**
 * A header value that may contain anything.
 *
 * A display name arrives in the subject line, and a subject is ASCII unless it
 * says otherwise. Encoded whole rather than per-word: simpler, and correct for
 * the one header this sends.
 */
function encodeHeader(value: string): string {
  if (/^[\x20-\x7E]*$/.test(value)) return value
  return `=?UTF-8?B?${Buffer.from(value, 'utf8').toString('base64')}?=`
}

/**
 * The message, as bytes.
 *
 * `multipart/alternative` holding the plain text and, as the richer
 * alternative, a `multipart/related` of the HTML and the pictures it names.
 * Nesting it the other way round is the usual mistake: the image would become a
 * sibling of the text and clients would show it as an attachment.
 */
export function buildMimeMessage(from: string, mail: Mail): Buffer {
  const alternative = `alt-${randomUUID()}`
  const related = `rel-${randomUUID()}`
  const attachments = mail.attachments ?? []

  const lines = [
    `From: ${from}`,
    `To: ${mail.to}`,
    `Subject: ${encodeHeader(mail.subject)}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${alternative}"`,
    '',
    `--${alternative}`,
    'Content-Type: text/plain; charset=utf-8',
    'Content-Transfer-Encoding: base64',
    '',
    base64Body(Buffer.from(mail.text, 'utf8')),
    '',
    `--${alternative}`,
    `Content-Type: multipart/related; boundary="${related}"`,
    '',
    `--${related}`,
    'Content-Type: text/html; charset=utf-8',
    'Content-Transfer-Encoding: base64',
    '',
    base64Body(Buffer.from(mail.html, 'utf8')),
    '',
  ]

  for (const attachment of attachments) {
    lines.push(
      `--${related}`,
      `Content-Type: ${attachment.contentType}`,
      'Content-Transfer-Encoding: base64',
      `Content-ID: <${attachment.cid}>`,
      // `inline`, so a client shows it in the message rather than as a paperclip.
      `Content-Disposition: inline; filename="${attachment.filename}"`,
      '',
      base64Body(attachment.data),
      '',
    )
  }

  lines.push(`--${related}--`, '', `--${alternative}--`, '')

  return Buffer.from(lines.join('\r\n'), 'utf8')
}

/** Configured but silent. Used everywhere there is no `MAIL_FROM`. */
export class NoMailer implements Mailer {
  async send(): Promise<void> {}
  cid(label: string): string {
    return `${label}.${randomUUID()}@escape-room.invalid`
  }
}

export class SesMailer implements Mailer {
  readonly #client: SESv2Client

  constructor(
    private readonly from: string,
    region: string,
  ) {
    this.#client = new SESv2Client({ region })
  }

  cid(label: string): string {
    // A Content-ID has to be globally unique and look like an address; some
    // clients cache by it, so reusing one across messages shows the wrong
    // picture.
    return `${label}.${randomUUID()}@cool.tf`
  }

  async send(mail: Mail): Promise<void> {
    await this.#client.send(
      new SendEmailCommand({
        FromEmailAddress: this.from,
        Destination: { ToAddresses: [mail.to] },
        Content: { Raw: { Data: buildMimeMessage(this.from, mail) } },
      }),
    )
  }
}
