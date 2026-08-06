import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
import type { GameSession, RoomPublicData } from '@escape-room/shared'
import { isRoomId, isRoomUnlocked, ROOM_IDS } from '@escape-room/shared'
import {
  ApiRequestError,
  completeRoom,
  fetchRoom,
  requestHint,
  resetRoom,
  startOrResumeGame,
  submitAttempt,
} from './api/game'
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
import { ROOM_COMPONENTS } from './rooms/room-03-registry'
import { previewRoomIdFromLocation, RoomPreview } from './rooms/preview'
import { unlockAudio } from './audio/sfx'
import { useLiveness } from './stage/useLiveness'
import { preloadCharacter, preloadScene } from './stage/preload'
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

  // Dev-only shortcut: `?preview=room-03` renders that room directly, with
  // mock data and no network calls, bypassing sign-in and the router
  // entirely — see rooms/preview.tsx.
  const previewRoomId = previewRoomIdFromLocation()
  if (previewRoomId) {
    return <RoomPreview roomId={previewRoomId} />
  }

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
  const { game, travel, character } = useGame()

  // The lobby's scenery, fetched while somebody is still reading this page.
  // Start is the button on this tab, so this is the last screen before the
  // stage — and a room cannot fly in if its furniture has not arrived
  // (ADR-0047).
  useEffect(() => {
    void preloadScene('lobby')
  }, [])

  // And the four parts you are wearing. Yours is the one character certain to
  // be standing on that stage, and the picker probably cached it already — but
  // not for somebody who signed up on another device and came back.
  useEffect(() => {
    if (character) void preloadCharacter(character)
  }, [character])

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

  // room-03 owns its whole screen instead of playing through the shared
  // Stage/RoomView shell every other room uses: it needs hints inline in
  // its own dialogue, a hearts system, a room-scoped reset, and a
  // `complete` step for stages with no server-checked answer (ADR-0066,
  // ADR-0070) — none of which RoomView's contract (onAnswer/busy, an
  // external hint list, an instant "Solved" swap) supports. See ADR-0065.
  if (roomId === 'room-03') {
    return <Room03Route game={game} onLeave={() => travel('/lobby')} onGameChange={setGame} />
  }

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

type RoomState =
  | { kind: 'loading' }
  | { kind: 'ready'; room: RoomPublicData }
  | { kind: 'error'; message: string }

/**
 * room-03, full-screen — the one room that opts out of the shared
 * Stage/RoomView shell (see `RoomRoute` above and ADR-0065). Everything
 * every *other* room gets from `RoomView` — entering, hints, submitting,
 * leaving on solve — is reimplemented here against room-03's own richer
 * `RoomProps` contract instead (onHint/onResetRoom/onCompleteRoom/
 * onRoomFinished), since RoomView's simpler onAnswer/busy shape has no room
 * for the Sphinx's hearts system, its own inline hints, or a completion
 * step with no answer to check.
 */
function Room03Route({
  game,
  onLeave,
  onGameChange,
}: {
  game: GameSession
  onLeave: () => void
  onGameChange: (game: GameSession) => void
}) {
  const { authHeaders } = useAppAuth()
  const authRef = useRef(authHeaders)
  authRef.current = authHeaders

  const roomId = 'room-03' as const

  // The room actually on screen can lag behind the server's own idea of
  // "solved" on purpose: the server may already consider room-03 solved
  // (its last attempt marked roomComplete, see ADR-0068) while the room's
  // own component is still showing an on-screen finale (a congratulations
  // scene, a walk through a door) that hasn't finished yet. `finished`
  // becomes true only once the room itself calls `onRoomFinished` — see
  // ADR-0069 — at which point this route hands back to the lobby exactly
  // like RoomView's own "Onward" button does.
  const [finished, setFinished] = useState(false)
  const [state, setState] = useState<RoomState>({ kind: 'loading' })

  useEffect(() => {
    let cancelled = false
    setState({ kind: 'loading' })

    authRef
      .current()
      .then((headers) => fetchRoom(headers, roomId))
      .then((room) => {
        if (!cancelled) setState({ kind: 'ready', room })
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setState({
            kind: 'error',
            message: error instanceof Error ? error.message : 'Could not load this room.',
          })
        }
      })

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (finished) onLeave()
  }, [finished, onLeave])

  if (state.kind === 'loading' || finished) {
    return (
      <section className="rounded-lg border border-vault-800 bg-vault-900/60 p-6">
        <p className="font-mono text-sm text-vault-300">Opening {roomId}…</p>
      </section>
    )
  }

  if (state.kind === 'error') {
    return (
      <section className="rounded-lg border border-alarm-800 bg-vault-900/60 p-6">
        <p className="font-mono text-sm text-alarm-400">Could not load this room: {state.message}</p>
      </section>
    )
  }

  const RoomComponent = ROOM_COMPONENTS[roomId]
  if (!RoomComponent) {
    return (
      <section className="rounded-lg border border-vault-800 bg-vault-900/60 p-6">
        <h2 className="font-mono text-sm text-vault-100">{state.room.title}</h2>
        <p className="mt-2 text-sm text-vault-400">This room has no frontend yet.</p>
      </section>
    )
  }

  return (
    <Suspense
      fallback={
        <section className="rounded-lg border border-vault-800 bg-vault-900/60 p-6">
          <p className="font-mono text-sm text-vault-300">Loading room…</p>
        </section>
      }
    >
      <RoomComponent
        room={state.room}
        onSubmit={async (answer) => {
          const result = await submitAttempt(await authRef.current(), roomId, answer)
          onGameChange(result.session)

          // Deliberately does NOT set `finished` here, even if this attempt
          // just solved the room server-side — see ADR-0069. The room being
          // solved and the player being ready to leave it are different
          // moments; only onRoomFinished (below) does that. `state.room`
          // may now be stale (this room's own publicData() has moved on,
          // e.g. to its next internal riddle) — re-fetch it so the room
          // keeps showing real content instead of the pre-attempt
          // snapshot, regardless of whether the room is now marked
          // complete.
          const refreshed = await fetchRoom(await authRef.current(), roomId)
          setState({ kind: 'ready', room: refreshed })
          return result
        }}
        onHint={async () => {
          const hintResponse = await requestHint(await authRef.current(), roomId)
          onGameChange({ ...game, hintsUsed: hintResponse.hintsUsed })
          return hintResponse
        }}
        onResetRoom={async () => {
          const result = await resetRoom(await authRef.current(), roomId)
          onGameChange(result.session)
          const refreshed = await fetchRoom(await authRef.current(), roomId)
          setState({ kind: 'ready', room: refreshed })
          return result
        }}
        onCompleteRoom={async () => {
          const result = await completeRoom(await authRef.current(), roomId)
          onGameChange(result.session)
          return result
        }}
        onRoomFinished={() => {
          // The room itself says its on-screen finale is done — now it's
          // safe to leave, exactly like RoomView's own "Onward" button.
          setFinished(true)
        }}
      />
    </Suspense>
  )
}
