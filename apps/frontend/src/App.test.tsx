import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
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

// What the identity provider is holding as this player's character. Null means
// somebody who has never built one — new sign-up or long-standing account, the
// gate cannot tell them apart and deliberately does not try.
let playerCharacter: unknown = null
const saveCharacter = vi.fn().mockResolvedValue(undefined)

// Clerk is still mocked because App imports its button components directly,
// but identity now comes through the shared auth interface — so these tests
// exercise the same path whether the app is running on Clerk or the local mode.
vi.mock('@clerk/react', () => ({
  SignInButton: ({ children }: { children: ReactNode }) => <>{children}</>,
  SignUpButton: ({ children }: { children: ReactNode }) => <>{children}</>,
  UserButton: () => <div data-testid="user-button" />,
}))

// jsdom has no canvas and never fires `onload` for an <img>, so the real
// compose step cannot run here. These tests are about the gate and the save
// wiring; drawing is covered in Character.test.tsx against a stubbed canvas.
vi.mock('./character/compose', () => ({
  composeCharacter: vi.fn().mockResolvedValue(new Blob(['png'], { type: 'image/png' })),
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
    storedCharacter: playerCharacter,
    saveCharacter,
    signOut: () => {},
  }),
}))

const { App } = await import('./App')

/**
 * Renders the app at a path.
 *
 * Every screen is a route now, so a test that wants the lobby or a room simply
 * starts there — which is also how deep-link recovery is tested (ADR-0040).
 */
function open(url = '/') {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <App />
    </MemoryRouter>,
  )
}
const { randomCharacter } = await import('./character/parts')

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
      // "I still have the game open", beaten from every screen (ADR-0045).
      if (url.includes('/stage')) return Promise.resolve(new Response(null, { status: 204 }))
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
  playerCharacter = null
  updateUser.mockClear()
  updateUser.mockResolvedValue(undefined)
  saveCharacter.mockClear()
  saveCharacter.mockResolvedValue(undefined)
})

describe('App', () => {
  it('always shows the title', () => {
    open()
    expect(screen.getByRole('heading', { name: /digitale escape room/i })).toBeInTheDocument()
  })

  describe('signed out', () => {
    it('shows the locked door and offers registration', () => {
      open()
      expect(screen.getByText(/the door is locked/i)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /register/i })).toBeInTheDocument()
    })

    it('does not reveal the rooms', () => {
      open()
      expect(screen.queryByTestId('room-01')).not.toBeInTheDocument()
    })

    it('does not call the API', () => {
      open()
      expect(fetch).not.toHaveBeenCalled()
    })
  })

  describe('signed in with a complete profile', () => {
    beforeEach(() => {
      signedIn = true
      // Built from the real catalogue rather than hand-written ids, so these
      // tests cannot pass against a character the app would reject.
      playerCharacter = randomCharacter()
    })

    it('shows the username and progress', async () => {
      open()
      expect(await screen.findByText(/alice42 — 1\/4 rooms solved/)).toBeInTheDocument()
    })

    it('sends the Clerk token to the API', async () => {
      open()
      await screen.findByText(/alice42/)

      const calls = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls
      const init = calls[0]?.[1] as RequestInit
      expect((init.headers as Record<string, string>).Authorization).toBe('Bearer test-token')
    })

    it('marks solved rooms and leaves the rest locked', async () => {
      open()
      await screen.findByText(/alice42/)

      for (const roomId of ROOM_IDS) {
        expect(screen.getByTestId(roomId)).toBeInTheDocument()
      }
      expect(screen.getByTestId('room-01')).toHaveAttribute('data-solved', 'true')
      expect(screen.getByTestId('room-02')).toHaveAttribute('data-solved', 'false')
    })

    it('shows the activity log, newest first', async () => {
      open()
      await screen.findByText(/alice42/)

      // The log lives behind its own tab now. Only the open tab is mounted —
      // friends and chat poll on a timer, so keeping every panel alive would
      // multiply that polling across panels nobody is looking at.
      await userEvent.click(screen.getByRole('tab', { name: /activity/i }))

      expect(screen.getByText(/your activity \(3\)/i)).toBeInTheDocument()
      expect(screen.getByText(/tried "nope" in room-01/i)).toBeInTheDocument()

      const entries = screen.getAllByRole('listitem').filter((li) => li.querySelector('time'))
      expect(entries[0]?.textContent).toMatch(/unlocked the next door/)
    })

    it('opens on the rooms tab, and keeps the game status visible across tabs', async () => {
      open()
      await screen.findByText(/alice42/)

      expect(screen.getByRole('tab', { name: /rooms/i })).toHaveAttribute('aria-selected', 'true')

      // Which room you are on is true regardless of what you are looking at,
      // so the status strip sits outside the tabs rather than inside one.
      await userEvent.click(screen.getByRole('tab', { name: /leaderboard/i }))
      expect(screen.getByText(/alice42 — 1\/4 rooms solved/)).toBeInTheDocument()
      expect(screen.queryByTestId('room-01')).not.toBeInTheDocument()
    })

    it('lets you change your character afterwards, and back out of it', async () => {
      open()
      await screen.findByText(/alice42/)

      await userEvent.click(screen.getByRole('button', { name: /change character/i }))
      expect(
        await screen.findByRole('heading', { name: /change your character/i }),
      ).toBeInTheDocument()

      // Backing out returns you to the game rather than to the sign-up gate.
      await userEvent.click(screen.getByRole('button', { name: /cancel/i }))
      expect(await screen.findByTestId('room-01')).toBeInTheDocument()
      expect(saveCharacter).not.toHaveBeenCalled()
    })

    it('moves between tabs with the arrow keys', async () => {
      open()
      await screen.findByText(/alice42/)

      // Required by the WAI-ARIA tabs pattern, and the first thing anybody
      // navigating by keyboard will try.
      screen.getByRole('tab', { name: /rooms/i }).focus()
      await userEvent.keyboard('{ArrowRight}')

      expect(screen.getByRole('tab', { name: /friends/i })).toHaveAttribute('aria-selected', 'true')
    })

    it('reports a failure instead of hanging', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 500 })))
      open()
      expect(await screen.findByText(/could not load your game/i)).toBeInTheDocument()
    })
  })

  describe('signed in without a character', () => {
    beforeEach(() => {
      signedIn = true
      playerCharacter = null
    })

    it('asks you to build one before it opens the game', async () => {
      open()

      expect(await screen.findByRole('heading', { name: /make yourself/i })).toBeInTheDocument()
      expect(screen.queryByTestId('room-01')).not.toBeInTheDocument()
    })

    it('catches long-standing accounts too, not only new sign-ups', async () => {
      // The gate reads what is stored rather than when the account was made,
      // so somebody who registered before characters existed meets the same
      // screen and no backfill is needed.
      clerkUsername = 'someone-from-before'
      open()

      expect(await screen.findByRole('heading', { name: /make yourself/i })).toBeInTheDocument()
    })

    it('opens on a complete character rather than an empty outline', async () => {
      open()
      await screen.findByRole('heading', { name: /make yourself/i })

      // One selected tile per slot, chosen at random on mount.
      const selected = document.querySelectorAll('[role="radio"][aria-checked="true"]')
      expect(selected.length).toBe(1) // only the open slot's grid is rendered
      expect(screen.getByRole('button', { name: /this is me/i })).toBeEnabled()
    })

    it('saves the character and the picture together', async () => {
      open()
      await screen.findByRole('heading', { name: /make yourself/i })

      await userEvent.click(screen.getByRole('button', { name: /this is me/i }))

      await waitFor(() => expect(saveCharacter).toHaveBeenCalledTimes(1))
      const [character, picture] = saveCharacter.mock.calls[0] as [unknown, Blob]
      expect(Object.keys(character as object).sort()).toEqual(['arm', 'body', 'head', 'leg'])
      expect(picture).toBeInstanceOf(Blob)
    })

    it('says so when the character cannot be saved, instead of hanging', async () => {
      saveCharacter.mockRejectedValueOnce(new Error('Clerk said no.'))
      open()
      await screen.findByRole('heading', { name: /make yourself/i })

      await userEvent.click(screen.getByRole('button', { name: /this is me/i }))

      expect(await screen.findByRole('alert')).toHaveTextContent(/clerk said no/i)
      expect(screen.getByRole('button', { name: /this is me/i })).toBeEnabled()
    })
  })

  describe('signed in without a username', () => {
    // These tests are about the profile form, and the character gate sits
    // directly behind it — without a character they would stop at the picker
    // rather than reaching the game.
    beforeEach(() => {
      playerCharacter = randomCharacter()
    })

    beforeEach(() => {
      signedIn = true
      clerkUsername = null
      clerkFirstName = null
      clerkLastName = null
      // The server decides this, not the browser — the UI reacts to the 409.
      //
      // Matched on the URL rather than on being the *first* call. It was the
      // first call until the liveness beat started running above every screen
      // (ADR-0045) and raced it — and a test that says "whatever is fetched
      // first is the game" is asserting on something it does not mean.
      let sessionCalls = 0
      vi.stubGlobal(
        'fetch',
        vi.fn().mockImplementation((input: RequestInfo | URL) => {
          const url = String(input)
          if (url.includes('/stage')) return Promise.resolve(new Response(null, { status: 204 }))
          if (url.includes('/sessions')) {
            sessionCalls += 1
            // Incomplete once; complete after the form has been submitted.
            return Promise.resolve(
              sessionCalls === 1 ? profileIncompleteResponse() : gameResponse(),
            )
          }
          return Promise.resolve(gameResponse())
        }),
      )
    })

    it('shows the profile form when the API says the profile is incomplete', async () => {
      open()
      expect(await screen.findByText(/before you go in/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/username/i)).toBeInTheDocument()
    })

    it('refuses to submit with a field left blank', async () => {
      open()
      await screen.findByText(/before you go in/i)

      await userEvent.type(screen.getByLabelText(/username/i), 'nepo')
      await userEvent.click(screen.getByRole('button', { name: /enter the first room/i }))

      expect(updateUser).not.toHaveBeenCalled()
    })

    it('saves the profile to Clerk and then opens the game', async () => {
      open()
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

      open()
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

      open()
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

/**
 * What paths buy: reload lands you where you were, and no `#` anywhere.
 *
 * Every one of these is a fresh mount at a URL — which is exactly what a reload
 * is, so these are the reload-recovery tests (ADR-0040).
 */
describe('real URLs', () => {
  beforeEach(() => {
    signedIn = true
    playerCharacter = randomCharacter()
  })

  it('opens a tab directly', async () => {
    open('/leaderboard')
    await screen.findByText(/alice42/)

    expect(screen.getByRole('tab', { name: /leaderboard/i })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    // The panel the path chose, not the default one.
    expect(screen.queryByTestId('room-01')).not.toBeInTheDocument()
  })

  it('opens the lobby directly', async () => {
    open('/lobby')
    expect(await screen.findByRole('heading', { name: /ready when you are/i })).toBeInTheDocument()
  })

  it('opens a room directly — this is what reloading inside one does', async () => {
    open('/room/room-01')
    expect(await screen.findByRole('button', { name: /leave the room/i })).toBeInTheDocument()
  })

  it('sends an unknown path home rather than showing an error', async () => {
    open('/somewhere-that-never-existed')
    await screen.findByText(/alice42/)
    expect(screen.getByTestId('room-01')).toBeInTheDocument()
  })

  it('sends a room that is not a room back to the lobby', async () => {
    open('/room/room-99')
    expect(await screen.findByRole('heading', { name: /ready when you are/i })).toBeInTheDocument()
  })

  it('restores the outfit from the query string', async () => {
    const mine = randomCharacter()
    open(`/character?head=${mine.head}&body=${mine.body}&arm=${mine.arm}&leg=${mine.leg}`)

    await screen.findByRole('heading', { name: /change your character/i })
    const checked = screen
      .getAllByRole('radio')
      .findIndex((tile) => tile.getAttribute('aria-checked') === 'true')
    const { partsIn } = await import('./character/parts')
    expect(partsIn('head')[checked]?.id).toBe(mine.head)
  })

  it('falls back rather than breaking on a part that no longer exists', async () => {
    // Query parameters can say anything, and a catalogue can change under a
    // shared link. A stale id should quietly become a valid one.
    open('/character?head=head-999')
    await screen.findByRole('heading', { name: /change your character/i })
    expect(
      screen.getAllByRole('radio').some((t) => t.getAttribute('aria-checked') === 'true'),
    ).toBe(true)
  })

  it('opens the picker at its own address, not as a takeover', async () => {
    open()
    await screen.findByText(/alice42/)
    await userEvent.click(screen.getByRole('button', { name: /change character/i }))
    expect(
      await screen.findByRole('heading', { name: /change your character/i }),
    ).toBeInTheDocument()
  })
})

describe('the character gate', () => {
  it('redirects somebody with no character to /character, and does not loop', async () => {
    signedIn = true
    playerCharacter = null

    open('/friends')

    // Sent to the picker rather than shown the friends panel — and once there,
    // the gate must not redirect again or nothing would ever render.
    expect(await screen.findByRole('heading', { name: /make yourself/i })).toBeInTheDocument()
  })

  it('offers no way out at the gate, because there is nothing behind it', async () => {
    signedIn = true
    playerCharacter = null

    open('/lobby')
    await screen.findByRole('heading', { name: /make yourself/i })
    expect(screen.queryByRole('button', { name: /cancel/i })).not.toBeInTheDocument()
  })
})
