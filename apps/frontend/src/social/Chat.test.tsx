import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('../auth/useAppAuth', () => ({
  useAppAuth: () => ({
    mode: 'local' as const,
    isLoaded: true,
    isSignedIn: true,
    profile: { username: 'alice', firstName: 'Alice', lastName: 'Example', imageUrl: null },
    authHeaders: () => Promise.resolve({ 'X-Dev-User': 'user_alice' }),
    updateProfile: vi.fn(),
    signOut: vi.fn(),
  }),
}))

const { ChatWindow } = await import('./ChatWindow')

const FRIEND = {
  userId: 'user_bob',
  username: 'bob',
  displayName: 'Bob',
  imageUrl: null,
}

function message(id: string, body: string, at: string, author = FRIEND.userId) {
  return { id, authorUserId: author, body, createdAt: at }
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

/** A short interval so the poll runs promptly, with real timers. */
function renderChat(pollIntervalMs = 10) {
  return render(
    <ChatWindow
      friend={FRIEND}
      meUserId="user_alice"
      onClose={() => undefined}
      pollIntervalMs={pollIntervalMs}
    />,
  )
}

describe('the conversation poll cursor', () => {
  it('does not step over a reply written just before the message you send', async () => {
    // The bug: absorbing your own sent message advanced the cursor to it. Your
    // message is newer than a reply written in the seconds before, so the next
    // poll asked for everything *after* yours and that reply was never fetched
    // again — silently lost from the conversation.
    const reads: string[] = []

    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === 'POST') {
          return Promise.resolve(
            json(
              {
                message: message(
                  'mine',
                  'and hello back',
                  '2026-08-04T10:00:05.000Z',
                  'user_alice',
                ),
              },
              201,
            ),
          )
        }
        reads.push(String(input))
        return Promise.resolve(json({ messages: [] }))
      }),
    )

    renderChat()
    await waitFor(() => expect(reads.length).toBeGreaterThan(0))

    await userEvent.type(screen.getByLabelText(/message bob/i), 'and hello back')
    const readsBeforeSending = reads.length
    await userEvent.click(screen.getByRole('button', { name: /send/i }))

    await screen.findByText('and hello back')

    // The next poll must not have moved past the message we just sent.
    await waitFor(() => expect(reads.length).toBeGreaterThan(readsBeforeSending))
    for (const url of reads.slice(readsBeforeSending)) {
      expect(url).not.toContain('mine')
    }
  })

  it('does advance on messages the server sent us', async () => {
    const reads: string[] = []
    let served = false

    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) => {
        reads.push(String(input))
        if (served) return Promise.resolve(json({ messages: [] }))
        served = true
        return Promise.resolve(
          json({ messages: [message('m1', 'hello', '2026-08-04T10:00:00.000Z')] }),
        )
      }),
    )

    renderChat()
    await screen.findByText('hello')

    // Otherwise every poll re-fetches the whole conversation for ever.
    await waitFor(() => expect(reads.length).toBeGreaterThan(1))
    expect(reads[reads.length - 1]).toContain('since=')
  })
})

describe('a conversation that has been closed', () => {
  it('says so, and stops polling, when the friendship ends', async () => {
    let calls = 0
    vi.stubGlobal(
      'fetch',
      vi.fn(() => {
        calls += 1
        return Promise.resolve(
          json({ error: { code: 'NOT_FRIENDS', message: 'You can only message friends.' } }, 403),
        )
      }),
    )

    renderChat()

    expect(await screen.findByRole('alert')).toHaveTextContent(/no longer friends/i)

    // A closed conversation is not a transient failure — retrying it every
    // three seconds for as long as the tab is open achieves nothing.
    const afterError = calls
    await new Promise((resolve) => setTimeout(resolve, 60))
    expect(calls).toBe(afterError)
  })
})

describe('rendering a message', () => {
  it('shows it as text, never as markup', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          json({
            messages: [
              message('m1', '<img src=x onerror=alert(1)>', '2026-08-04T10:00:00.000Z'),
            ],
          }),
        ),
      ),
    )

    const { container } = renderChat()

    await screen.findByText('<img src=x onerror=alert(1)>')
    expect(container.querySelector('img[src="x"]')).toBeNull()
  })
})
