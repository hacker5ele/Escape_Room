import { useCallback, useEffect, useRef, useState } from 'react'
import { SignInButton, SignUpButton, UserButton } from '@clerk/react'
import type { GameSession, RoomId } from '@escape-room/shared'
import { isRoomUnlocked, ROOM_IDS } from '@escape-room/shared'
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
import { CharacterPicker } from './character/CharacterPicker'
import { composeCharacter } from './character/compose'
import { isCharacter, type Character } from './character/parts'
import { Tabs } from './ui/Tabs'
import { LobbyView } from './lobby/LobbyView'
import { RoomView } from './rooms/RoomView'
import { unlockAudio } from './audio/sfx'
import { IrisWipe } from './fx/IrisWipe'

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
        {/* Fluid rather than two fixed steps. "Der digitale Escape Room" set in
            Syne extrabold is wide, and at a fixed 48px it ran off a 320px
            phone; clamping to the viewport keeps it one confident block at
            every width instead of breaking into ragged lines. */}
        <h1 className="font-display text-[clamp(2rem,8.5vw,3.75rem)] leading-[0.98] font-extrabold tracking-[-0.045em] text-stock-900">
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
  const { authHeaders, mode, signOut, profile, storedCharacter, saveCharacter } = useAppAuth()
  const [state, setState] = useState<GameState>({ kind: 'loading' })

  // Draw the character, then hand the picture and the part ids over together.
  // Composing here rather than inside the picker keeps the picker a pure
  // chooser — it knows nothing about canvases or identity providers.
  const [editingCharacter, setEditingCharacter] = useState(false)

  /**
   * Where the player is: the tabbed page, the lobby, or inside a room.
   *
   * Held in state rather than the URL hash, unlike the tabs. The hash already
   * belongs to the tab strip, and a lobby is somewhere you *are* rather than
   * somewhere you link to — a bookmark to a countdown is not a useful thing to
   * be able to make.
   */
  const [place, setPlace] = useState<{ kind: 'page' } | { kind: 'lobby' } | { kind: 'room'; roomId: RoomId }>({
    kind: 'page',
  })

  // The Start button is the first gesture in the flow by construction, which
  // makes it the only place an AudioContext can be built without the browser
  // refusing it. Every later sound depends on this one click.
  const [flooding, setFlooding] = useState<null | (() => void)>(null)

  /** Runs the ink flood, and changes the screen at the moment it is covered. */
  const travel = useCallback((to: () => void) => {
    setFlooding(() => to)
  }, [])

  const enterLobby = useCallback(() => {
    // The first gesture in the flow by construction, which makes it the only
    // place an AudioContext can be built without the browser refusing it.
    unlockAudio()
    travel(() => setPlace({ kind: 'lobby' }))
  }, [travel])

  const confirmCharacter = useCallback(
    async (character: Character) => {
      const picture = await composeCharacter(character)
      await saveCharacter(character, picture)
      setEditingCharacter(false)
    },
    [saveCharacter],
  )

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

  /**
   * Wraps whichever screen is current with the transition overlay.
   *
   * The panel has several early returns and the flood has to sit above all of
   * them, so it is applied here rather than repeated. The screen swap happens
   * at `onCovered` — full ink — which is what makes the change unseen rather
   * than merely quick.
   */
  const withFlood = (content: React.ReactNode) => (
    <>
      {content}
      {flooding && (
        <IrisWipe
          onCovered={() => flooding()}
          onDone={() => setFlooding(null)}
        />
      )}
    </>
  )

  if (state.kind === 'needs-profile') {
    return withFlood(<ProfileForm onSaved={() => void open()} />)
  }

  // Everybody builds a character, not only new sign-ups. Checking what is
  // stored rather than when the account was created means players who
  // registered before this existed meet the same screen, and no separate
  // backfill is needed (ADR-0033).
  //
  // A UX gate, not a security boundary: it runs in the browser and reads
  // client-writable metadata. That is the right standing for something purely
  // cosmetic — the same as the frontend room guard.
  if (state.kind !== 'loading' && !isCharacter(storedCharacter)) {
    return withFlood(
      <CharacterPicker
        onConfirm={confirmCharacter}
        replacesExistingPhoto={profile?.imageUrl != null}
      />,
    )
  }

  // The lobby and the rooms take the whole screen, so they replace the page
  // rather than sitting inside it — which is also what lets the stage have the
  // room it needs.
  if (state.kind === 'ready' && isCharacter(storedCharacter) && place.kind === 'lobby') {
    return withFlood(
      <LobbyView
        game={state.game}
        character={storedCharacter}
        onEnterRoom={(roomId) => travel(() => setPlace({ kind: 'room', roomId }))}
        onLeave={() => travel(() => setPlace({ kind: 'page' }))}
      />,
    )
  }

  if (state.kind === 'ready' && isCharacter(storedCharacter) && place.kind === 'room') {
    return withFlood(
      <RoomView
        roomId={place.roomId}
        game={state.game}
        character={storedCharacter}
        onSolved={(session) => setState({ kind: 'ready', game: session })}
        onLeave={() => travel(() => setPlace({ kind: 'lobby' }))}
      />,
    )
  }

  // Reopened deliberately, so it starts from who you already are and can be
  // backed out of — neither of which is true of the gate above.
  if (editingCharacter && isCharacter(storedCharacter)) {
    return withFlood(
      <CharacterPicker
        onConfirm={confirmCharacter}
        onCancel={() => setEditingCharacter(false)}
        initial={storedCharacter}
      />,
    )
  }

  const game = state.kind === 'ready' ? state.game : null

  return withFlood(
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
          <button
            type="button"
            onClick={() => setEditingCharacter(true)}
            className="btn btn-ghost btn-sm"
          >
            Change character
          </button>
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
          { id: 'rooms', label: 'Rooms', render: () => <RoomsTab game={game} onStart={enterLobby} /> },
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
    </>,
  )
}

/**
 * The rooms — the only tab that is the game itself rather than something
 * arranged around it, which is why it comes first and opens by default.
 */
function RoomsTab({ game, onStart }: { game: GameSession | null; onStart: () => void }) {
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
      <button
        type="button"
        onClick={onStart}
        disabled={game === null}
        className="btn play-button mt-5 w-full"
      >
        Start ▶
      </button>
      <p className="prose mt-3 text-sm text-stock-600">
        Takes you to the waiting room. Friends can join you there — or press play and go in alone.
      </p>
    </section>
  )
}
