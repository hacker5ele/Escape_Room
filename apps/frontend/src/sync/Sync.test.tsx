import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

let signedIn = true

vi.mock('../auth/useAppAuth', () => ({
  useAppAuth: () => ({
    mode: 'local' as const,
    isLoaded: true,
    isSignedIn: signedIn,
    profile: signedIn ? { username: 'alice', firstName: 'Alice', lastName: 'Example' } : null,
    authHeaders: () => Promise.resolve({ 'X-Dev-User': 'user_alice' }),
    updateProfile: vi.fn(),
    storedCharacter: { head: 'head-01', body: 'body-01', arm: 'arm-01', leg: 'leg-01' },
    saveCharacter: vi.fn(),
    signOut: vi.fn(),
  }),
}))

const { SyncProvider } = await import('./SyncProvider')
const { NotificationBell } = await import('./NotificationBell')

function notification(id: string, message = 'Bob wants to be your friend.') {
  return {
    id,
    type: 'friend_request' as const,
    createdAt: new Date(Date.now() - 60_000).toISOString(),
    readAt: null,
    actor: { userId: 'user_bob', username: 'bob', displayName: 'Bob', imageUrl: null },
    message,
  }
}

function syncBody(notifications: ReturnType<typeof notification>[], unreadCount = notifications.length) {
  return new Response(
    JSON.stringify({ now: new Date().toISOString(), notifications, unreadCount }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  )
}

/** Answers every poll with the same page, and records the calls. */
function stubSync(pages: Array<ReturnType<typeof syncBody>> | (() => Response)) {
  const queue = Array.isArray(pages) ? [...pages] : null
  const spy = vi.fn((input: RequestInfo | URL) => {
    const url = String(input)
    if (url.includes('/sync/read')) return Promise.resolve(new Response(null, { status: 204 }))
    if (queue) return Promise.resolve(queue.shift() ?? syncBody([], 0))
    return Promise.resolve((pages as () => Response)())
  })
  vi.stubGlobal('fetch', spy)
  return spy
}

function renderBell() {
  return render(
    <SyncProvider>
      <NotificationBell />
    </SyncProvider>,
  )
}

beforeEach(() => {
  signedIn = true
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('the notification badge', () => {
  it('shows the unread count from the server', async () => {
    stubSync([syncBody([notification('n1'), notification('n2')], 2)])
    renderBell()

    expect(await screen.findByTestId('unread-badge')).toHaveTextContent('2')
  })

  it('caps the badge rather than letting it grow the layout', async () => {
    stubSync([syncBody([notification('n1')], 42)])
    renderBell()

    expect(await screen.findByTestId('unread-badge')).toHaveTextContent('9+')
  })

  it('shows nothing when there is nothing unread', async () => {
    stubSync([syncBody([], 0)])
    renderBell()

    await waitFor(() => expect(screen.queryByTestId('unread-badge')).not.toBeInTheDocument())
  })

  it('says the count in the accessible name, not only in colour', async () => {
    stubSync([syncBody([notification('n1')], 1)])
    renderBell()

    expect(await screen.findByRole('button', { name: /1 unread/i })).toBeInTheDocument()
  })
})

describe('opening the bell', () => {
  it('lists what happened', async () => {
    stubSync([syncBody([notification('n1')])])
    renderBell()

    await screen.findByTestId('unread-badge')
    await userEvent.click(screen.getByRole('button', { name: /notifications/i }))

    expect(screen.getByText('Bob wants to be your friend.')).toBeInTheDocument()
  })

  it('clears the badge and tells the server', async () => {
    const fetchSpy = stubSync([syncBody([notification('n1')], 1), syncBody([], 0)])
    renderBell()

    await screen.findByTestId('unread-badge')
    await userEvent.click(screen.getByRole('button', { name: /notifications/i }))

    await waitFor(() => expect(screen.queryByTestId('unread-badge')).not.toBeInTheDocument())
    await waitFor(() =>
      expect(fetchSpy.mock.calls.some(([url]) => String(url).includes('/sync/read'))).toBe(true),
    )
  })

  it('keeps the notification visible after it is marked read', async () => {
    stubSync([syncBody([notification('n1')], 1), syncBody([], 0)])
    renderBell()

    await screen.findByTestId('unread-badge')
    await userEvent.click(screen.getByRole('button', { name: /notifications/i }))

    // Seen is not the same as gone.
    expect(screen.getByText('Bob wants to be your friend.')).toBeInTheDocument()
  })

  it('says so when there is nothing', async () => {
    stubSync([syncBody([], 0)])
    renderBell()

    await waitFor(() => expect(screen.queryByTestId('unread-badge')).not.toBeInTheDocument())
    await userEvent.click(screen.getByRole('button', { name: /notifications/i }))

    expect(screen.getByText(/nothing yet/i)).toBeInTheDocument()
  })
})

describe('the poll itself', () => {
  it('sends the server’s own timestamp back as the cursor, not the browser clock', async () => {
    const now = '2026-08-04T10:00:00.000Z'
    const fetchSpy = vi.fn((input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/sync/read')) return Promise.resolve(new Response(null, { status: 204 }))
      return Promise.resolve(
        new Response(JSON.stringify({ now, notifications: [], unreadCount: 0 }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
    })
    vi.stubGlobal('fetch', fetchSpy)

    renderBell()
    await waitFor(() => expect(fetchSpy).toHaveBeenCalled())

    // Force a second poll by bringing the tab back to the front.
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'))
    })

    await waitFor(() => expect(fetchSpy.mock.calls.length).toBeGreaterThan(1))
    const second = String(fetchSpy.mock.calls[1]![0])
    expect(second).toContain(`since=${encodeURIComponent(now)}`)
  })

  it('does not repeat a notification the server sends twice', async () => {
    // The server deliberately overlaps its window, so the same row comes back
    // on the next poll. Without deduping, the bell would fill with copies.
    stubSync(() => syncBody([notification('n1')], 1))
    renderBell()

    await screen.findByTestId('unread-badge')
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'))
    })

    await userEvent.click(screen.getByRole('button', { name: /notifications/i }))
    expect(screen.getAllByText('Bob wants to be your friend.')).toHaveLength(1)
  })

  it('does not poll at all when signed out', async () => {
    signedIn = false
    const fetchSpy = stubSync([syncBody([], 0)])

    renderBell()
    // Nothing to poll for, and no credentials to poll with.
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('survives a failed poll without showing an error', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))))
    renderBell()

    // A container restart or a phone changing network must not put a banner on
    // screen — the next tick just tries again.
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /notifications/i })).toBeInTheDocument()
  })
})
