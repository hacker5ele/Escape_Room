import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ROOM_IDS } from '@escape-room/shared'

/**
 * Clerk is mocked so the suite stays offline and needs no key.
 *
 * The two knobs below are what the components actually depend on: whether
 * somebody is signed in, and whether their profile already carries a name.
 */
let signedIn = false
let firstName: string | null = 'Alice'
const updateUser = vi.fn().mockResolvedValue(undefined)

vi.mock('@clerk/react', () => ({
  Show: ({ when, children }: { when: string; children: ReactNode }) => {
    const visible = when === 'signed-in' ? signedIn : !signedIn
    return visible ? <>{children}</> : null
  },
  SignInButton: ({ children }: { children: ReactNode }) => <>{children}</>,
  SignUpButton: ({ children }: { children: ReactNode }) => <>{children}</>,
  UserButton: () => <div data-testid="user-button" />,
  useAuth: () => ({ getToken: () => Promise.resolve('test-token') }),
  useUser: () => ({
    isLoaded: true,
    user: { firstName, update: updateUser },
  }),
}))

const { App } = await import('./App')

function mockGame(solvedRooms: string[] = ['room-01']) {
  // A fresh Response per call. Reusing one would pass only while the app calls
  // fetch exactly once — and would hide it the moment it stopped doing that,
  // because a consumed body throws rather than returning the wrong answer.
  return vi.fn().mockImplementation(() =>
    Promise.resolve(
      new Response(
        JSON.stringify({
          session: {
            id: '00000000-0000-4000-8000-000000000000',
            userId: 'user_alice',
            playerName: 'Alice',
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
      ),
    ),
  )
}

beforeEach(() => {
  vi.stubGlobal('fetch', mockGame())
})

afterEach(() => {
  vi.restoreAllMocks()
  signedIn = false
  firstName = 'Alice'
  updateUser.mockClear()
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

  describe('signed in with a name already', () => {
    beforeEach(() => {
      signedIn = true
    })

    it('opens the game and shows progress from the account', async () => {
      render(<App />)
      expect(await screen.findByText(/Alice — 1\/4 rooms solved/)).toBeInTheDocument()
    })

    it('sends the Clerk token to the API', async () => {
      render(<App />)
      await screen.findByText(/Alice/)

      const calls = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls
      const init = calls[0]?.[1] as RequestInit
      expect((init.headers as Record<string, string>).Authorization).toBe('Bearer test-token')
    })

    it('marks solved rooms and leaves the rest locked', async () => {
      render(<App />)
      await screen.findByText(/Alice/)

      for (const roomId of ROOM_IDS) {
        expect(screen.getByTestId(roomId)).toBeInTheDocument()
      }
      expect(screen.getByTestId('room-01')).toHaveAttribute('data-solved', 'true')
      expect(screen.getByTestId('room-02')).toHaveAttribute('data-solved', 'false')
    })

    it('shows the activity log, newest first', async () => {
      render(<App />)
      await screen.findByText(/Alice/)

      expect(screen.getByText(/your activity \(3\)/i)).toBeInTheDocument()
      expect(screen.getByText(/started the game/i)).toBeInTheDocument()
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

  describe('signed in without a name', () => {
    beforeEach(() => {
      signedIn = true
      firstName = null
    })

    it('asks for a name before starting the game', () => {
      render(<App />)
      expect(screen.getByText(/before you go in/i)).toBeInTheDocument()
      // Critically, no game is created until the name exists — otherwise the
      // name recorded on the game would be a placeholder forever.
      expect(fetch).not.toHaveBeenCalled()
    })

    it('refuses to continue when a field is blank', async () => {
      render(<App />)
      await userEvent.type(screen.getByLabelText(/first name/i), 'Nepomuk')
      await userEvent.click(screen.getByRole('button', { name: /enter the first room/i }))

      expect(updateUser).not.toHaveBeenCalled()
      expect(fetch).not.toHaveBeenCalled()
    })

    it('saves the name to Clerk and then opens the game', async () => {
      render(<App />)
      await userEvent.type(screen.getByLabelText(/first name/i), 'Nepomuk')
      await userEvent.type(screen.getByLabelText(/last name/i), 'Crhonek')
      await userEvent.click(screen.getByRole('button', { name: /enter the first room/i }))

      await waitFor(() => {
        expect(updateUser).toHaveBeenCalledWith({ firstName: 'Nepomuk', lastName: 'Crhonek' })
      })
      expect(await screen.findByText(/1\/4 rooms solved/)).toBeInTheDocument()
    })

    it('trims surrounding whitespace', async () => {
      render(<App />)
      await userEvent.type(screen.getByLabelText(/first name/i), '  Nepomuk  ')
      await userEvent.type(screen.getByLabelText(/last name/i), '  Crhonek ')
      await userEvent.click(screen.getByRole('button', { name: /enter the first room/i }))

      await waitFor(() => {
        expect(updateUser).toHaveBeenCalledWith({ firstName: 'Nepomuk', lastName: 'Crhonek' })
      })
    })

    it('shows an error and stays put when saving fails', async () => {
      updateUser.mockRejectedValueOnce(new Error('nope'))
      render(<App />)
      await userEvent.type(screen.getByLabelText(/first name/i), 'Nepomuk')
      await userEvent.type(screen.getByLabelText(/last name/i), 'Crhonek')
      await userEvent.click(screen.getByRole('button', { name: /enter the first room/i }))

      expect(await screen.findByRole('alert')).toBeInTheDocument()
      expect(fetch).not.toHaveBeenCalled()
    })
  })
})
