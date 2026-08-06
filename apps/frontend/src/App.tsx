import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Navigate,
  Outlet,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useOutletContext,
  useParams,
} from 'react-router-dom'
import { SignInButton, SignUpButton, UserButton } from '@clerk/react'
import type { GameSession } from '@escape-room/shared'
import { isRoomId, isRoomUnlocked, ROOM_IDS } from '@escape-room/shared'
import { ApiRequestError, startOrResumeGame } from './api/game'
import { ProfileForm } from './account/ProfileForm'
import { ActivityLog } from './account/ActivityLog'
import { Avatar } from './social/Avatar'
import { FriendsPanel } from './social/FriendsPanel'
import { Leaderboard } from './social/Leaderboard'
import { InvitePage } from './social/InvitePage'
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
import { useLiveness } from './stage/useLiveness'
import { Assemble, LEAVE_TOTAL_MS, unbuild } from './fx/Assemble'
import { isInviteToken } from './routing'

/**
 * Every screen the app has, addressed by a real path.
 *
 * There is no hash anywhere and no screen held only in component state, which
 * means reloading returns you to where you were — inside a room, mid-outfit, on
 * the leaderboard. See ADR-0040.
 *
 * Deep links work because every environment already rewrites unknown paths to
 * `index.html`: a CloudFront function in the deployed environments, `try_files`
 * in the docker nginx, and Vite's own fallback in development. None of that
 * needed adding — it was built for this before there was anything to route.
 */
export function App() {
  useLegacyHashRedirect()

  return (
    <Routes>
      {/* Outside every gate, deliberately: an invite link that demanded an
          account before it showed you anything would be a registration wall
          rather than a link (ADR-0024). */}
      <Route path="/invite/:token" element={<InviteRoute />} />

      <Route element={<RequiresGame />}>
        <Route path="/character" element={<CharacterRoute />} />
        <Route path="/lobby" element={<LobbyRoute />} />
        <Route path="/room/:roomId" element={<RoomRoute />} />

        <Route element={<GameLayout />}>
          <Route path="/" element={<RoomsRoute />} />
          <Route path="/friends" element={<FriendsRoute />} />
          <Route path="/leaderboard" element={<LeaderboardRoute />} />
          <Route path="/activity" element={<ActivityRoute />} />
        </Route>
      </Route>

      {/* An unknown path is a typo or a stale link, not an error page. */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

/**
 * `/#friends` → `/friends`, once.
 *
 * The tabs lived in the hash until this change and links were shared in the
 * team chat this week. Three lines to keep them working.
 */
function useLegacyHashRedirect(): void {
  const navigate = useNavigate()

  useEffect(() => {
    const legacy = window.location.hash.replace(/^#/, '')
    if (!legacy) return
    const known = ['friends', 'leaderboard', 'activity']
    navigate(known.includes(legacy) ? `/${legacy}` : '/', { replace: true })
  }, [navigate])
}

function InviteRoute() {
  const { token } = useParams()
  // Validated rather than trusted: the router hands over whatever was in the
  // segment, and the token goes straight into a request URL.
  return isInviteToken(token) ? <InvitePage token={token} /> : <Navigate to="/" replace />
}

/** The masthead and the column everything sits in. */
function PageShell({ children }: { children: React.ReactNode }) {
  // Top-aligned, not vertically centred. Centring a page whose height grows
  // with its content means everything shifts the moment a panel appears.
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-6 px-5 py-10 sm:px-8">
      <header>
        {/* Syne at its heaviest with the tracking pulled in — the masthead is
            the one place the display face gets to be a poster. Fluid rather
            than stepped: at a fixed 48px it ran off a 320px phone. */}
        <h1 className="font-display text-[clamp(2rem,8.5vw,3.75rem)] leading-[0.98] font-extrabold tracking-[-0.045em] text-stock-900">
          Der digitale Escape Room
        </h1>
      </header>
      {children}
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

/** What every gated route can read, via `useGame()`. */
interface GameOutlet {
  game: GameSession
  /** Null only at `/character`, which is where you go to fix that. */
  character: Character | null
  reload: () => Promise<void>
  setGame: (game: GameSession) => void
  /** Navigate once the screen has come apart, so the change itself is unseen. */
  travel: (to: string) => void
  saveCharacter: (character: Character) => Promise<void>
}

export function useGame(): GameOutlet {
  return useOutletContext<GameOutlet>()
}

type GameState =
  | { kind: 'loading' }
  | { kind: 'needs-profile' }
  | { kind: 'ready'; game: GameSession }
  | { kind: 'error'; message: string }

/**
 * The gates, as one layout route rather than a stack of early returns.
 *
 * In order: still loading, signed out, profile incomplete, no character. Only
 * when all four are clear does `<Outlet/>` render — so every route below can
 * assume a signed-in player with a game, and none of them repeats the checks.
 */
function RequiresGame() {
  const { isLoaded, isSignedIn, mode, storedCharacter, saveCharacter } = useAppAuth()
  const [state, setState] = useState<GameState>({ kind: 'loading' })

  // "I still have the game open", from every screen rather than only the stage.
  // Being in a friend's game is a claim kept alive by beating (ADR-0045), so a
  // beat that only ran in the lobby would drop you out of their game the moment
  // you opened the leaderboard. Mounted here because this is the one component
  // that is up for as long as somebody is playing.
  useLiveness({ enabled: isSignedIn === true })
  const location = useLocation()
  const navigate = useNavigate()

  // Held in a ref, and the effect runs on mount only. Depending on
  // `authHeaders` directly would re-run this on every render that hands back a
  // fresh function identity — which is every render.
  const { authHeaders } = useAppAuth()
  const authRef = useRef(authHeaders)
  authRef.current = authHeaders

  const reload = useCallback(async () => {
    setState({ kind: 'loading' })
    try {
      setState({ kind: 'ready', game: await startOrResumeGame(await authRef.current()) })
    } catch (error) {
      // Whether a profile is complete is the server's call, not the browser's.
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
    if (isSignedIn) void reload()
  }, [isSignedIn, reload])

  /**
   * Navigate once the screen has come apart.
   *
   * The route changes when there is nothing left on it but dots, which is what
   * makes the change unseen rather than merely quick — and the new screen's
   * pieces then fly in on their own (`<Assemble>` below).
   *
   * The guard is not theoretical. An earlier version of this ran its animation
   * once per render of whatever called it, and the transition played six times
   * for one click; a second press before the first has landed is the same bug
   * arriving by hand.
   */
  const leaving = useRef<number | null>(null)

  useEffect(() => () => window.clearTimeout(leaving.current ?? undefined), [])

  const travel = useCallback(
    (to: string) => {
      if (leaving.current !== null) return
      unlockAudio()
      unbuild()
      leaving.current = window.setTimeout(() => {
        leaving.current = null
        navigate(to)
      }, LEAVE_TOTAL_MS)
    },
    [navigate],
  )

  const confirmCharacter = useCallback(
    async (character: Character) => {
      const picture = await composeCharacter(character)
      await saveCharacter(character, picture)
    },
    [saveCharacter],
  )

  const character = isCharacter(storedCharacter) ? storedCharacter : null

  const loaded = state.kind === 'ready' ? state.game : null

  // Null until the game is loaded, rather than an empty object cast into shape.
  // Every early return below happens before the outlet renders, so a route can
  // trust that `game` is real.
  const context = useMemo<GameOutlet | null>(
    () =>
      loaded
        ? {
            game: loaded,
            character,
            reload,
            setGame: (game) => setState({ kind: 'ready', game }),
            travel,
            saveCharacter: confirmCharacter,
          }
        : null,
    [loaded, character, reload, travel, confirmCharacter],
  )

  if (!isLoaded) return <PageShell>{<Panel>Loading…</Panel>}</PageShell>

  if (!isSignedIn) {
    return <PageShell>{mode === 'local' ? <LocalSignIn /> : <LockedDoor />}</PageShell>
  }

  if (state.kind === 'needs-profile') {
    return (
      <PageShell>
        <ProfileForm onSaved={() => void reload()} />
      </PageShell>
    )
  }

  if (state.kind === 'error') {
    return (
      <PageShell>
        <Panel>Could not load your game: {state.message}</Panel>
      </PageShell>
    )
  }

  if (!context) return <PageShell>{<Panel>Opening your game…</Panel>}</PageShell>

  // Everybody builds a character, not only new sign-ups — the check is on what
  // is stored rather than when the account was made, so older accounts meet the
  // same screen and no backfill is needed (ADR-0033).
  //
  // Not when already there, or this is a redirect loop. `state.from` is carried
  // so confirming returns you to whatever you were trying to open.
  if (!character && location.pathname !== '/character') {
    return <Navigate to="/character" replace state={{ from: location.pathname }} />
  }

  // Above the outlet rather than inside a route, so it is still mounted on the
  // other side of the navigation it is covering — that is what lets one screen
  // come apart and the next one build itself out of the same animation.
  return (
    <Assemble>
      <Outlet context={context} />
    </Assemble>
  )
}

/**
 * The tabbed page: masthead, status strip, tab strip, and whichever panel the
 * path selected.
 *
 * The status strip lives here rather than in each tab, so switching tabs no
 * longer remounts it — which room you are on is true regardless of what you are
 * looking at.
 */
function GameLayout() {
  const context = useGame()
  const { game } = context
  const { mode, signOut, profile } = useAppAuth()
  const navigate = useNavigate()

  return (
    <PageShell>
      <section className="pane flex flex-wrap items-center justify-between gap-4 p-5">
        <div className="flex items-center gap-4">
          {/* Only where Clerk's UserButton is not rendering a face already —
              with it, the same picture appeared twice in one header. */}
          {mode !== 'clerk' && (
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
              {game.username} — {game.solvedRooms.length}/{ROOM_IDS.length} rooms solved
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate('/character')}
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

      <Tabs
        label="Your game"
        tabs={[
          { path: '/', label: 'Rooms' },
          { path: '/friends', label: 'Friends' },
          { path: '/leaderboard', label: 'Leaderboard' },
          { path: '/activity', label: 'Activity' },
        ]}
      >
        <Outlet context={context} />
      </Tabs>
    </PageShell>
  )
}

/**
 * The rooms — the only tab that is the game itself rather than something
 * arranged around it, which is why it is `/` and opens by default.
 */
function RoomsRoute() {
  const { game, travel } = useGame()

  return (
    <section className="pane p-5">
      <h2 className="label">Rooms</h2>
      <ul className="mt-3 grid gap-2 sm:grid-cols-2">
        {ROOM_IDS.map((roomId, index) => {
          const solved = game.solvedRooms.includes(roomId)
          const unlocked = isRoomUnlocked(game, roomId)

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

              {/* The frosted lock state (ADR-0032). Cosmetic only — the server
                  refuses a locked room and never sends its contents. */}
              <span className="veil" data-unlocked={unlocked}>
                {roomId}
              </span>
            </li>
          )
        })}
      </ul>
      <button
        type="button"
        onClick={() => travel('/lobby')}
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

function FriendsRoute() {
  const { game, reload } = useGame()
  return <FriendsPanel meUserId={game.userId} onGameChanged={() => void reload()} />
}

function LeaderboardRoute() {
  const { game } = useGame()
  return <Leaderboard solvedCount={game.solvedRooms.length} />
}

function ActivityRoute() {
  const { game } = useGame()
  return <ActivityLog events={game.events} />
}

/**
 * The character picker, at a real address.
 *
 * One route for two jobs, because they are the same screen: with a character
 * you are editing (there is a way out, and it opens on yours); without one you
 * are at the gate (there is not, because there is nothing behind it yet).
 */
function CharacterRoute() {
  const { character, saveCharacter } = useGame()
  const { profile } = useAppAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const from = (location.state as { from?: string } | null)?.from
  const back = from && from !== '/character' ? from : '/'

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-6 px-5 py-10 sm:px-8">
      <CharacterPicker
        initial={character ?? undefined}
        onCancel={character ? () => navigate(back) : undefined}
        replacesExistingPhoto={profile?.imageUrl != null}
        onConfirm={async (next) => {
          await saveCharacter(next)
          navigate(back)
        }}
      />
    </main>
  )
}

function LobbyRoute() {
  const { game, character, travel } = useGame()
  if (!character) return <Navigate to="/character" replace />

  return (
    <LobbyView
      game={game}
      character={character}
      onEnterRoom={(roomId) => travel(`/room/${roomId}`)}
      onLeave={() => travel('/')}
    />
  )
}

function RoomRoute() {
  const { game, character, setGame, travel } = useGame()
  const { roomId } = useParams()

  if (!character) return <Navigate to="/character" replace />
  // A typo in the path is a typo, not a crash.
  if (!isRoomId(roomId)) return <Navigate to="/lobby" replace />

  return (
    <RoomView
      roomId={roomId}
      game={game}
      character={character}
      onSolved={setGame}
      onLeave={() => travel('/lobby')}
    />
  )
}
