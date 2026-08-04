import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ROOM_IDS } from '@escape-room/shared'

/**
 * Clerk is mocked so the suite stays offline and needs no key.
 *
 * `signedIn` drives `<Show when=…>`; `updateUser` stands in for the profile
 * write, and is made to reject when a test needs the "username taken" path.
 */
let signedIn = false
// What Clerk already holds. The form asks only for what is missing, so these
// drive which fields appear.
let clerkUsername: string | null = 'alice42'
let clerkFirstName: string | null = 'Alice'
let clerkLastName: string | null = 'Example'
const updateUser = vi.fn().mockResolvedValue(undefined)

// Clerk is still mocked because App imports its button components directly,
// but identity now comes through the shared auth interface — so these tests
// exercise the same path whether the app is running on Clerk or the local mode.
vi.mock('@clerk/react', () => ({
  SignInButton: ({ children }: { children: ReactNode }) => <>{children}</>,
  SignUpButton: ({ children }: { children: ReactNode }) => <>{children}</>,
  UserButton: () => <div data-testid="user-button" />,
}))

vi.mock('./auth/useAppAuth', () => ({
  useAppAuth: () => ({
    mode: 'clerk' as const,
    isLoaded: true,
    isSignedIn: signedIn,
    profile: signedIn
      ? { username: clerkUsername, firstName: clerkFirstName, lastName: clerkLastName }
      : null,
    authHeaders: () => Promise.resolve({ Authorization: 'Bearer test-token' }),
    updateProfile: updateUser,
    signOut: () => {},
  }),
}))

const { App } = await import('./App')

function gameResponse(solvedRooms: string[] = ['room-01']) {
  return new Response(
    JSON.stringify({
      session: {
        id: '00000000-0000-4000-8000-000000000000',
        userId: 'user_alice',
        username: 'alice42',
        playerName: 'Alice Example',
        solvedRooms,
        startedAt: new Date(0).toISOString(),
        finishedAt: null,
        hintsUsed: 0,
        events: [
          { at: '2026-08-03T10:00:00.000Z', type: 'game_started' },
          {
            at: '2026-08-03T10:01:00.000Z',
            type: 'attempt',
            roomId: 'room-01',
            correct: false,
            answer: 'nope',
          },
          { at: '2026-08-03T10:02:00.000Z', type: 'room_solved', roomId: 'room-01' },
        ],
      },
    }),
    { status: 201, headers: { 'Content-Type': 'application/json' } },
  )
}

function profileIncompleteResponse() {
  return new Response(
    JSON.stringify({
      error: { code: 'PROFILE_INCOMPLETE', message: 'Choose a username before you start playing.' },
    }),
    { status: 409, headers: { 'Content-Type': 'application/json' } },
  )
}

/** Empty social lists, so the friends panel renders without a network. */
function emptyFriendsResponse() {
  return new Response(JSON.stringify({ friends: [], incoming: [], outgoing: [] }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

/** A party of one — nobody has joined, and the player hosts their own game. */
function soloPartyResponse() {
  return new Response(
    JSON.stringify({
      party: {
        host: {
          userId: 'user_alice',
          username: 'alice42',
          displayName: 'Alice Example',
          imageUrl: null,
        },
        members: [],
        isHost: true,
      },
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  )
}

function emptyLeaderboardResponse() {
  return new Response(JSON.stringify({ entries: [] }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

function emptyInvitesResponse() {
  return new Response(JSON.stringify({ invites: [] }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

beforeEach(() => {
  // Routed by path rather than one canned reply for everything: the page now
  // makes three different calls, and answering all of them with a game session
  // would test nothing while looking like it passed.
  //
  // A fresh Response per call — a consumed body throws rather than quietly
  // returning the wrong thing.
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation((input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/party')) return Promise.resolve(soloPartyResponse())
      if (url.includes('/leaderboard')) return Promise.resolve(emptyLeaderboardResponse())
      if (url.includes('/friends')) return Promise.resolve(emptyFriendsResponse())
      if (url.includes('/invites')) return Promise.resolve(emptyInvitesResponse())
      return Promise.resolve(gameResponse())
    }),
  )
})

afterEach(() => {
  vi.restoreAllMocks()
  signedIn = false
  clerkUsername = 'alice42'
  clerkFirstName = 'Alice'
  clerkLastName = 'Example'
  updateUser.mockClear()
  updateUser.mockResolvedValue(undefined)
})

describe('App', () => {
  it('always shows the title', () => {
    render(<App />)
    expect(screen.getByRole('heading', { name: /digitale escape room/i })).toBeInTheDocument()
  })

  describe('signed out', () => {
    it('shows the locked door and offers registration', () => {
      render(<App />)
      expect(screen.getByText(/the door is locked/i)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /register/i })).toBeInTheDocument()
    })

    it('does not reveal the rooms', () => {
      render(<App />)
      expect(screen.queryByTestId('room-01')).not.toBeInTheDocument()
    })

    it('does not call the API', () => {
      render(<App />)
      expect(fetch).not.toHaveBeenCalled()
    })
  })

  describe('signed in with a complete profile', () => {
    beforeEach(() => {
      signedIn = true
    })

    it('shows the username and progress', async () => {
      render(<App />)
      expect(await screen.findByText(/alice42 — 1\/4 rooms solved/)).toBeInTheDocument()
    })

    it('sends the Clerk token to the API', async () => {
      render(<App />)
      await screen.findByText(/alice42/)

      const calls = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls
      const init = calls[0]?.[1] as RequestInit
      expect((init.headers as Record<string, string>).Authorization).toBe('Bearer test-token')
    })

    it('marks solved rooms and leaves the rest locked', async () => {
      render(<App />)
      await screen.findByText(/alice42/)

      for (const roomId of ROOM_IDS) {
        expect(screen.getByTestId(roomId)).toBeInTheDocument()
      }
      expect(screen.getByTestId('room-01')).toHaveAttribute('data-solved', 'true')
      expect(screen.getByTestId('room-02')).toHaveAttribute('data-solved', 'false')
    })

    it('shows the activity log, newest first', async () => {
      render(<App />)
      await screen.findByText(/alice42/)

      expect(screen.getByText(/your activity \(3\)/i)).toBeInTheDocument()
      expect(screen.getByText(/tried "nope" in room-01/i)).toBeInTheDocument()

      const entries = screen.getAllByRole('listitem').filter((li) => li.querySelector('time'))
      expect(entries[0]?.textContent).toMatch(/unlocked the next door/)
    })

    it('reports a failure instead of hanging', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 500 })))
      render(<App />)
      expect(await screen.findByText(/could not load your game/i)).toBeInTheDocument()
    })
  })

  describe('signed in without a username', () => {
    beforeEach(() => {
      signedIn = true
      clerkUsername = null
      clerkFirstName = null
      clerkLastName = null
      // The server decides this, not the browser — the UI reacts to the 409.
      vi.stubGlobal(
        'fetch',
        vi
          .fn()
          .mockImplementationOnce(() => Promise.resolve(profileIncompleteResponse()))
          .mockImplementation(() => Promise.resolve(gameResponse())),
      )
    })

    it('shows the profile form when the API says the profile is incomplete', async () => {
      render(<App />)
      expect(await screen.findByText(/before you go in/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/username/i)).toBeInTheDocument()
    })

    it('refuses to submit with a field left blank', async () => {
      render(<App />)
      await screen.findByText(/before you go in/i)

      await userEvent.type(screen.getByLabelText(/username/i), 'nepo')
      await userEvent.click(screen.getByRole('button', { name: /enter the first room/i }))

      expect(updateUser).not.toHaveBeenCalled()
    })

    it('saves the profile to Clerk and then opens the game', async () => {
      render(<App />)
      await screen.findByText(/before you go in/i)

      await userEvent.type(screen.getByLabelText(/username/i), 'nepo')
      await userEvent.type(screen.getByLabelText(/first name/i), 'Nepomuk')
      await userEvent.type(screen.getByLabelText(/last name/i), 'Crhonek')
      await userEvent.click(screen.getByRole('button', { name: /enter the first room/i }))

      await waitFor(() => {
        expect(updateUser).toHaveBeenCalledWith({
          username: 'nepo',
          firstName: 'Nepomuk',
          lastName: 'Crhonek',
        })
      })
      expect(await screen.findByText(/1\/4 rooms solved/)).toBeInTheDocument()
    })

    it('asks only for the name when Clerk already has a username', async () => {
      // The likely case now that usernames are required at sign-up but names
      // are configured separately. Re-asking for a handle they already have
      // would be confusing, and re-submitting it risks failing on Clerk's own
      // "unchanged value" validation.
      clerkUsername = 'already_taken_by_me'

      render(<App />)
      await screen.findByText(/before you go in/i)

      expect(screen.queryByLabelText(/username/i)).not.toBeInTheDocument()
      expect(screen.getByLabelText(/first name/i)).toBeInTheDocument()

      await userEvent.type(screen.getByLabelText(/first name/i), 'Nepomuk')
      await userEvent.type(screen.getByLabelText(/last name/i), 'Crhonek')
      await userEvent.click(screen.getByRole('button', { name: /enter the first room/i }))

      await waitFor(() => {
        // No username in the payload — only what was actually asked for.
        expect(updateUser).toHaveBeenCalledWith({ firstName: 'Nepomuk', lastName: 'Crhonek' })
      })
    })

    it('explains that a username is taken rather than failing generically', async () => {
      // Clerk's shape for a duplicate identifier.
      updateUser.mockRejectedValueOnce({ errors: [{ code: 'form_identifier_exists' }] })

      render(<App />)
      await screen.findByText(/before you go in/i)

      await userEvent.type(screen.getByLabelText(/username/i), 'taken')
      await userEvent.type(screen.getByLabelText(/first name/i), 'Nepomuk')
      await userEvent.type(screen.getByLabelText(/last name/i), 'Crhonek')
      await userEvent.click(screen.getByRole('button', { name: /enter the first room/i }))

      expect(await screen.findByRole('alert')).toHaveTextContent(/taken/i)
      // Still on the form, so the player can pick another.
      expect(screen.getByLabelText(/username/i)).toBeInTheDocument()
    })
  })
})
