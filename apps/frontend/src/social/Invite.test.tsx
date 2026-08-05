import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { LocalAuthProvider } from '../auth/LocalAuthProvider'
import { InvitePage } from './InvitePage'
import { isInviteToken } from '../routing'

describe('the token the router hands over', () => {
  it('accepts the base64url alphabet the tokens actually use', () => {
    expect(isInviteToken('abc123')).toBe(true)
    expect(isInviteToken('aB-_9xYz')).toBe(true)
  })

  it('rejects anything that is not one', () => {
    for (const value of [undefined, '', 'a'.repeat(129)]) {
      expect(isInviteToken(value), String(value)).toBe(false)
    }
  })

  it('rejects characters a real token cannot contain', () => {
    // The token goes straight into a request URL, and the router will hand over
    // whatever was in the segment — including percent-encoded traversal, which
    // survives the browser's own normalisation.
    for (const value of ['../../etc', '<script>', 'a/b', '%2e%2e%2f', 'a b']) {
      expect(isInviteToken(value), value).toBe(false)
    }
  })
})

function mockFetch(handler: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  const spy = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) =>
    handler(String(input), init),
  )
  vi.stubGlobal('fetch', spy)
  return spy
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

const INVITER = {
  userId: 'user_ada',
  username: 'ada',
  displayName: 'Ada Lovelace',
  imageUrl: null,
}

beforeEach(() => {
  window.localStorage.clear()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('the invite landing page', () => {
  it('shows who is inviting you before asking you to sign in', async () => {
    const fetchSpy = mockFetch(() => json({ inviter: INVITER, party: null }))

    render(
      <LocalAuthProvider>
        <InvitePage token="tok_abc" />
      </LocalAuthProvider>,
    )

    expect(await screen.findByText('Ada Lovelace')).toBeInTheDocument()
    expect(screen.getByText('@ada')).toBeInTheDocument()

    // The whole point: the preview is fetched while signed out, and it carries
    // no credentials.
    const [url, init] = fetchSpy.mock.calls[0]!
    expect(String(url)).toBe('/api/invites/tok_abc')
    expect(JSON.stringify(init?.headers ?? {})).not.toMatch(/authorization|x-dev-user/i)
  })

  it('offers a way to sign in rather than an accept button when signed out', async () => {
    mockFetch(() => json({ inviter: INVITER, party: null }))

    render(
      <LocalAuthProvider>
        <InvitePage token="tok_abc" />
      </LocalAuthProvider>,
    )

    await screen.findByText('Ada Lovelace')
    expect(screen.queryByRole('button', { name: /^accept$/i })).not.toBeInTheDocument()
    expect(screen.getByLabelText(/username/i)).toBeInTheDocument()
  })

  it('says the same thing for a revoked link as for one that never existed', async () => {
    mockFetch(() =>
      json({ error: { code: 'INVITE_INVALID', message: 'That invite link is no longer valid.' } }, 404),
    )

    render(
      <LocalAuthProvider>
        <InvitePage token="tok_gone" />
      </LocalAuthProvider>,
    )

    await waitFor(() => {
      expect(screen.getByText(/no longer valid/i)).toBeInTheDocument()
    })
    // No profile is shown, so nothing leaks about who once owned the link.
    expect(screen.queryByText('Ada Lovelace')).not.toBeInTheDocument()
  })

  it('does not render the inviter name as markup', async () => {
    mockFetch(() =>
      json({ inviter: { ...INVITER, displayName: '<img src=x onerror=alert(1)>' }, party: null }),
    )

    const { container } = render(
      <LocalAuthProvider>
        <InvitePage token="tok_abc" />
      </LocalAuthProvider>,
    )

    await screen.findByText('<img src=x onerror=alert(1)>')
    expect(container.querySelector('img[src="x"]')).toBeNull()
  })
})
