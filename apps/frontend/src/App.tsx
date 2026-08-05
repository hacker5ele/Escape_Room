import { useCallback, useEffect, useRef, useState } from 'react'
import { SignInButton, SignUpButton, UserButton } from '@clerk/react'
import type { GameSession } from '@escape-room/shared'
import { currentRoomId, isRoomUnlocked, ROOM_IDS } from '@escape-room/shared'
import { ApiRequestError, startOrResumeGame } from './api/game'
import { ProfileForm } from './account/ProfileForm'
import { ActivityLog } from './account/ActivityLog'
import { Avatar } from './social/Avatar'
import { FriendsPanel } from './social/FriendsPanel'
import { Leaderboard } from './social/Leaderboard'
import { InvitePage } from './social/InvitePage'
import { inviteTokenFromPath } from './routing'
import { NotificationBell } from './sync/NotificationBell'
import { LocalSignIn } from './auth/LocalSignIn'
import { useAppAuth } from './auth/useAppAuth'
import { Tabs } from './ui/Tabs'
import { CurrentRoom } from './rooms/CurrentRoom'

/**
 * The scaffold page, behind a sign-in gate.
 *
 * Signed out you get the door and nothing else. Signed in, the app asks the API
 * to open your game — which proves the whole chain: an identity provider issues
 * a credential, the browser sends it, the API verifies it and finds the game
 * belonging to that account.
 *
 * The rooms replace the panel below. See ADR-0007 for where each sub-team's
 * code goes.
 */
export function App() {
  const { isLoaded, isSignedIn, mode } = useAppAuth()

  // Read after the hook, never before it, so the hook order cannot change.
  const inviteToken = inviteTokenFromPath(window.location.pathname)
  if (inviteToken) return <InvitePage token={inviteToken} />

  // Top-aligned, not vertically centred. Centring a page whose height grows
  // with its content means everything shifts the moment a panel appears, and
  // with four sections stacked it simply crushed together.
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-6 px-5 py-10 sm:px-8">
      <header>
        {/* Syne at its heaviest with the tracking pulled in — the masthead is
            the one place the display face gets to be a poster. Deliberately
            not uppercase: German capitalises its nouns already, and setting
            it in caps loses that and shouts. */}
        <h1 className="font-display text-5xl font-extrabold tracking-[-0.045em] text-stock-900 sm:text-6xl">
          Der digitale Escape Room
        </h1>
      </header>

      {!isLoaded && <Panel>Loading…</Panel>}
      {isLoaded && !isSignedIn && (mode === 'local' ? <LocalSignIn /> : <LockedDoor />)}
      {isLoaded && isSignedIn && <GamePanel />}
    </main>
  )
}

function Panel({ children }: { children: React.ReactNode }) {
  return (
    <section className="pane p-5">
      <p className="font-mono text-sm text-stock-900">{children}</p>
    </section>
  )
}

function LockedDoor() {
  return (
    <section className="pane p-6">
      <h2 className="font-display text-2xl font-bold tracking-[-0.03em] text-stock-900">
        The door is locked
      </h2>
      <p className="mt-2 text-sm text-stock-700">
        Create an account to enter. Your progress is saved to it, so you can leave a room
        half-solved and come back to it.
      </p>

      <div className="mt-5 flex flex-wrap gap-3">
        <SignUpButton mode="modal">
          <button type="button" className="btn">
            Register
          </button>
        </SignUpButton>

        <SignInButton mode="modal">
          <button type="button" className="btn btn-ghost">
            I already have an account
          </button>
        </SignInButton>
      </div>
    </section>
  )
}

type GameState =
  | { kind: 'loading' }
  | { kind: 'needs-profile' }
  | { kind: 'ready'; game: GameSession }
  | { kind: 'error'; message: string }

function GamePanel() {
  const { authHeaders, mode, signOut, profile } = useAppAuth()
  const [state, setState] = useState<GameState>({ kind: 'loading' })
  // Whether the player is inside a room right now. Entering hides the tabbed
  // shell entirely — see `CurrentRoom`, which takes over the whole viewport.
  const [entered, setEntered] = useState(false)

  // Held in a ref, and the effect runs on mount only.
  //
  // Depending on `authHeaders` directly would re-run this on every render that
  // hands back a fresh function identity — which is every render — so the app
  // would call the API in a loop for as long as the panel is mounted.
  const authHeadersRef = useRef(authHeaders)
  authHeadersRef.current = authHeaders

  const open = useCallback(async () => {
    setState({ kind: 'loading' })
    try {
      const game = await startOrResumeGame(await authHeadersRef.current())
      setState({ kind: 'ready', game })
    } catch (error) {
      // Whether a profile is complete is the server's call, not the browser's.
      // Reading it from the response means the UI cannot disagree with the API
      // about who is allowed to start a game.
      if (error instanceof ApiRequestError && error.needsProfile) {
        setState({ kind: 'needs-profile' })
        return
      }
      setState({
        kind: 'error',
        message: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  }, [])

  useEffect(() => {
    void open()
  }, [open])

  if (state.kind === 'needs-profile') {
    return <ProfileForm onSaved={() => void open()} />
  }

  const game = state.kind === 'ready' ? state.game : null
  const openRoomId = game ? currentRoomId(game) : null

  if (entered && game && openRoomId) {
    return (
      <CurrentRoom
        roomId={openRoomId}
        onExit={() => setEntered(false)}
        onGameChanged={(updated) => {
          setState({ kind: 'ready', game: updated })
          // The room just solved was the last one — nothing left to play.
          if (currentRoomId(updated) === null) setEntered(false)
        }}
      />
    )
  }

  return (
    <>
      <section className="pane flex flex-wrap items-center justify-between gap-4 p-5">
        <div className="flex items-center gap-4">
          {/* Only where Clerk's UserButton is not rendering a face already.
              With it, the same picture appeared twice in one header — once
              here and once as the account menu on the right. */}
          {game && mode !== 'clerk' && (
            <Avatar
              size={44}
              subject={{
                userId: game.userId,
                username: game.username,
                displayName: game.playerName,
                imageUrl: profile?.imageUrl ?? null,
              }}
            />
          )}
          <div>
            <h2 className="label">Your game</h2>
            <p className="mt-1.5 text-sm text-stock-900">
              {state.kind === 'loading' && 'Opening your game…'}
              {game &&
                `${game.username} — ${game.solvedRooms.length}/${ROOM_IDS.length} rooms solved`}
              {state.kind === 'error' && `Could not load your game: ${state.message}`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <NotificationBell />
          {mode === 'clerk' ? (
            <UserButton />
          ) : (
            <button type="button" onClick={signOut} className="btn btn-ghost btn-sm">
              Sign out
            </button>
          )}
        </div>
      </section>

      {/* Everything used to sit in one stacked column — rooms, leaderboard,
          friends and the activity log all at once, in a 672px gutter. Tabs
          give each its own space and put the game first.

          The status strip above deliberately stays outside them: which room
          you are on is true regardless of what you are looking at. */}
      <Tabs
        label="Your game"
        tabs={[
          {
            id: 'rooms',
            label: 'Rooms',
            render: () => <RoomsTab game={game} onEnterRoom={() => setEntered(true)} />,
          },
          ...(game
            ? [
                {
                  id: 'friends',
                  label: 'Friends',
                  render: () => (
                    <FriendsPanel meUserId={game.userId} onGameChanged={() => void open()} />
                  ),
                },
                {
                  id: 'leaderboard',
                  label: 'Leaderboard',
                  render: () => <Leaderboard solvedCount={game.solvedRooms.length} />,
                },
                {
                  id: 'activity',
                  label: 'Activity',
                  render: () => <ActivityLog events={game.events} />,
                },
              ]
            : []),
        ]}
      />
    </>
  )
}

/**
 * The rooms — the only tab that is the game itself rather than something
 * arranged around it, which is why it comes first and opens by default.
 */
function RoomsTab({ game, onEnterRoom }: { game: GameSession | null; onEnterRoom: () => void }) {
  const openRoomId = game ? currentRoomId(game) : null

  return (
    <section className="pane p-5">
      <h2 className="label">Rooms</h2>
      <ul className="mt-3 grid gap-2 sm:grid-cols-2">
        {ROOM_IDS.map((roomId, index) => {
          const solved = game !== null && game.solvedRooms.includes(roomId)
          const unlocked = game !== null && isRoomUnlocked(game, roomId)

          return (
            <li
              key={roomId}
              data-testid={roomId}
              data-solved={solved}
              data-unlocked={unlocked}
              className="pane-inset flex items-center gap-3 px-3 py-2 text-sm text-stock-700"
            >
              <span
                className={
                  solved ? 'text-solved-600' : unlocked ? 'text-signal-600' : 'text-stock-400'
                }
              >
                {solved ? '✓' : index + 1}
              </span>

              {/* The frosted lock state (ADR-0032). A room you cannot enter yet
                  is blurred: you can see there is one without being able to
                  read it.

                  Cosmetic, and only cosmetic. The server refuses a locked room
                  outright and never sends its contents (ADR-0006) — so this is
                  that fact made visible, not the thing enforcing it. Screen
                  readers still get the name, which is right; the room ids were
                  never the secret. */}
              <span className="veil" data-unlocked={unlocked}>
                {roomId}
              </span>
            </li>
          )
        })}
      </ul>
      <p className="prose mt-4 text-sm text-stock-600">
        The rooms themselves are the team&apos;s work — this panel only proves the account and the
        API agree about whose game this is.
      </p>

      {openRoomId && (
        <button type="button" onClick={onEnterRoom} className="btn mt-5">
          Start escape room
        </button>
      )}
    </section>
  )
}
