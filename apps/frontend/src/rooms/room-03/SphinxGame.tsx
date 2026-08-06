import { useEffect, useRef, useState } from 'react'
import type { RoomProps } from '../room-props'
import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  createInitialState,
  drawAttack,
  render,
  shakeOffset,
  update,
  ZONES,
  type EngineState,
  type KeysDown,
} from './game/corridor'
import {
  ARTIFACTS,
  ATLANTIS_CANVAS_WIDTH,
  ATLANTIS_GROUND_Y,
  ATLANTIS_QUEST_TIME_MS,
  ATLANTIS_WORLD_WIDTH,
  advanceCarpet,
  allCoinsCollected,
  collectNearbyCoins,
  createAtlantisQuestState,
  createCarpetPlayer,
  createEndingSceneState,
  createOlympusRaceState,
  createPoseidonSceneState,
  createWaitingRoomState,
  ENDING_GROUND_Y,
  isQuestComplete,
  OLYMPUS_CANVAS_HEIGHT,
  OLYMPUS_CANVAS_WIDTH,
  OLYMPUS_COIN_COUNT,
  OLYMPUS_RACE_TIME_MS,
  OLYMPUS_WORLD_HEIGHT,
  OLYMPUS_WORLD_WIDTH,
  POSEIDON_GROUND_Y,
  reachedFinish,
  renderAtlantisScene,
  renderEndingScene,
  renderOlympusRace,
  renderPoseidonThroneScene,
  renderWaitingRoom,
  tryInteract,
  type ArtifactId,
  type AtlantisQuestState,
  type AtlantisRenderState,
  type CarpetKeysDown,
  type CarpetPlayer,
  type EndingSceneState,
  type OlympusRaceState,
  type PoseidonSceneState,
  type WaitingRoomState,
} from './game/scenes'
import { drawPlayer } from './game/creatures'
import { Hourglass, HieroglyphHud, HeartsHud, Portrait } from './game/hud'
import './sphinx.css'

interface Choice {
  letter: string
  text: string
}

interface RoomData {
  riddleNumber: number
  riddleCount: number
  riddleTitle?: string
  riddleText: string
  choices: Choice[]
  hearts: number
  maxHearts: number
}

function isRoomData(data: Record<string, unknown>): data is RoomData & Record<string, unknown> {
  return (
    typeof data.riddleNumber === 'number' &&
    typeof data.riddleCount === 'number' &&
    typeof data.riddleText === 'string' &&
    Array.isArray(data.choices) &&
    typeof data.hearts === 'number' &&
    typeof data.maxHearts === 'number'
  )
}

// A flat 20s for every riddle — enough to read a same-length riddle once
// and pick an answer, without the earlier ramp making the later, harder
// riddles even more time-pressured on top of being harder.
const RIDDLE_TIME_LIMIT_MS = 20000
const ATTACK_DURATION_MS = 2600

type Overlay =
  | { kind: 'none' }
  | { kind: 'speaking' }
  | { kind: 'asking'; selected: string | null; submitting: boolean }
  | { kind: 'result'; feedback: string | null }
  | { kind: 'hint-error' }

/**
 * Once every riddle is solved, the corridor is done with the player — they
 * simply walk to the door under their own power. The rest of the ending
 * lives in its own small state machine, separate from the corridor's
 * explore/riddle/attack phases:
 *
 *   corridor (door reached) -> chamber-entering -> chamber-greeting
 *   -> chamber-free (door lit, walk into it) -> exiting (whiteout)
 *   -> atlantis (find & place Poseidon's 3 artifacts)
 *   -> poseidon-greeting -> poseidon-free -> poseidon-exiting
 *   -> olympus (a top-down carpet race: 10 coins, 30s, reach the finish
 *      gate — entirely client-side, same as Atlantis; POST .../complete
 *      is what actually finishes the room once it's won, see ADR-0070)
 *   -> won
 */
type EndingPhase =
  | 'chamber-entering'
  | 'chamber-greeting'
  | 'chamber-free'
  | 'exiting'
  | 'atlantis'
  | 'poseidon-greeting'
  | 'poseidon-free'
  | 'poseidon-exiting'
  | 'olympus'
  | 'won'

const ATLANTIS_PLAYER_SPEED = 220 // px/sec, matches the corridor's own PLAYER_SPEED

/**
 * The 2D chamber: a walking player, a camera that follows them, five riddle
 * zones tied to physical locations. The riddle content and correctness are
 * entirely server-driven — this component never decides an answer is right.
 * `room.data` is whichever riddle the server currently has the player on
 * (see room-03.ts's currentStage()); the world's "which zones are already
 * solved" state is a local mirror used only for the walking/camera
 * experience and the atmosphere, and it resets to match the server whenever
 * the server sends back a wrong answer.
 *
 * Once every riddle is solved, walking to the door hands off to the ending
 * sequence (see game/scenes.ts): a distinct white-tile/blue-flame/gold
 * chamber where the Sphinx appears facing the player, congratulates them,
 * and a golden door leads to a final "outside the pyramid" view.
 */
export function Room03({ room, onSubmit, onHint, onResetRoom, onCompleteRoom, onRoomFinished }: RoomProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const canvasWrapRef = useRef<HTMLDivElement | null>(null)
  // The canvas's actual on-screen pixel size, kept live by the ResizeObserver
  // effect below. Every scene is designed against a fixed 1280x720 space
  // (CANVAS_WIDTH/CANVAS_HEIGHT) — rather than resizing every hand-tuned
  // draw call in render.ts/ending.ts/atlantis.ts, the game loop below draws
  // that fixed space into a `cover`-scaled transform, so the canvas fills
  // whatever box it's actually given (no letterboxing) at the cost of
  // cropping slightly off one edge on window shapes that don't match 16:9,
  // exactly like a CSS `background-size: cover` image would.
  const canvasSizeRef = useRef({ width: CANVAS_WIDTH, height: CANVAS_HEIGHT })
  const stateRef = useRef<EngineState>(createInitialState())
  const keysRef = useRef<KeysDown>({ left: false, right: false })
  const frameRef = useRef(0)
  const attackStartRef = useRef<number | null>(null)
  const rafRef = useRef<number | null>(null)
  const endingRef = useRef<EndingSceneState>(createEndingSceneState())
  const atlantisQuestRef = useRef<AtlantisQuestState>(createAtlantisQuestState())
  const atlantisPlayerRef = useRef({ x: 80, facing: 1 as 1 | -1, walking: false, cameraX: 0 })
  const poseidonRef = useRef<PoseidonSceneState>(createPoseidonSceneState())
  const waitingRoomRef = useRef<WaitingRoomState>(createWaitingRoomState())
  const olympusRaceRef = useRef<OlympusRaceState>(createOlympusRaceState())
  const carpetPlayerRef = useRef<CarpetPlayer>(createCarpetPlayer())
  const carpetKeysRef = useRef<CarpetKeysDown>({ up: false, down: false, left: false, right: false })

  const [phase, setPhase] = useState<'explore' | 'riddle' | 'attack' | 'ending'>('explore')
  const [overlay, setOverlay] = useState<Overlay>({ kind: 'none' })
  const [typedText, setTypedText] = useState('')
  const [timeLeftMs, setTimeLeftMs] = useState<number | null>(null)
  const [, forceRerender] = useState(0)
  const [endingPhase, setEndingPhase] = useState<EndingPhase | null>(null)
  const [atlantisTimeLeftMs, setAtlantisTimeLeftMs] = useState(ATLANTIS_QUEST_TIME_MS)
  const [atlantisFeedback, setAtlantisFeedback] = useState<string | null>(null)
  // Mirrors atlantisQuestRef.current.carrying so the "you're holding
  // something, go place it" caption can stay up the whole time you're
  // carrying it, not just flash briefly like the toast messages do.
  const [carryingId, setCarryingId] = useState<ArtifactId | null>(null)

  const [olympusTimeLeftMs, setOlympusTimeLeftMs] = useState(OLYMPUS_RACE_TIME_MS)
  const [olympusCoinsCollected, setOlympusCoinsCollected] = useState(0)
  const [olympusMessage, setOlympusMessage] = useState<string | null>(null)
  // True once the coin count + finish line are both cleared and
  // POST .../complete is in flight — blocks input and re-entry while that
  // call resolves, same spirit as Atlantis's resettingRoom guard.
  const [completingRoom, setCompletingRoom] = useState(false)

  // The shared 3-hearts pool (ADR-0066): starts in sync with the server's
  // own count for the Sphinx corridor, and is spent locally by Atlantis
  // mistakes, which have no server counterpart of their own. Whichever side
  // loses the last heart is responsible for calling resetWholeRoom().
  const [hearts, setHearts] = useState(3)
  const [resettingRoom, setResettingRoom] = useState(false)
  const [wrongFeedback, setWrongFeedback] = useState<string | null>(null)
  // The text of the most recently revealed hint — onHint() returns it, but
  // nothing displayed it before; this is what handleHint() actually shows.
  // Cleared whenever a new riddle starts so an old hint can't linger onto
  // the next question.
  const [hintText, setHintText] = useState<string | null>(null)

  // Read inside the rAF loop below, which closes over state from mount
  // time — mirrored into a ref so the loop always sees the current value
  // without having to re-subscribe the whole effect on every phase change.
  const endingPhaseRef = useRef<EndingPhase | null>(null)
  endingPhaseRef.current = endingPhase

  const completingRoomRef = useRef(false)
  completingRoomRef.current = completingRoom
  const coinsCollectedRef = useRef(0)
  // Set below, once handleOlympusRaceFinished is declared — mirrored into a
  // ref for the same reason endingPhaseRef is, so the rAF loop's closure
  // (created once, on mount) can call the latest version of the handler.
  const raceFinishedRef = useRef<() => void>(() => {})

  const data = isRoomData(room.data) ? room.data : null
  const riddleIndex = data ? data.riddleNumber - 1 : 0

  // --- Hearts: stay in sync with the server in the corridor AND Olympus ----
  // Both are server-checked riddle sequences, so data.hearts is always the
  // truth there. Everything from Atlantis through the two Poseidon beats
  // has no server call at all — `data` is just a snapshot taken back when
  // the corridor's door was reached, and stays stale the whole time. This
  // effect used to re-run on every endingPhase change (including
  // atlantis -> poseidon-greeting -> poseidon-exiting -> olympus, none of
  // which touch the server), which stomped Atlantis's own locally-spent
  // heart count back to that stale snapshot each time, with nothing wrong
  // ever having happened. It's keyed only on data.hearts changing now —
  // that only happens after a real server round trip (a corridor or
  // Olympus attempt), which is exactly when a resync should happen. The one
  // remaining case this must NOT fire for is while hearts are being spent
  // locally in Atlantis with no data change at all — already excluded,
  // since data never changes there.
  useEffect(() => {
    if (endingPhase === 'atlantis' || endingPhase === 'won') return
    if (data) setHearts(data.hearts)
  }, [data?.hearts])

  // The corridor's local solvedZones set only exists for camera/atmosphere
  // purposes (see the module doc comment) and must mirror the server's real
  // riddleIndex, not drift from it. A wrong answer no longer clears it
  // directly (a lost heart retries the same riddle, progress intact) — this
  // is what notices the one case that DOES need a full corridor reset: the
  // server reporting riddleIndex 0 after progress had already been made,
  // i.e. the third heart was just lost.
  useEffect(() => {
    const state = stateRef.current
    if (riddleIndex === 0 && state.solvedZones.size > 0) {
      state.solvedZones.clear()
      state.player.x = 80
      forceRerender((n) => n + 1)
    }
  }, [riddleIndex])

  // --- Full-screen takeover -------------------------------------------------
  // The chamber is a fixed, full-viewport overlay (see .sphinx-chamber), so
  // the page behind it must not scroll while it's up.
  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [])

  // --- Responsive canvas: match the wrap's real on-screen size ------------
  useEffect(() => {
    const wrap = canvasWrapRef.current
    const canvas = canvasRef.current
    if (!wrap || !canvas) return

    const dpr = window.devicePixelRatio || 1

    function resize(width: number, height: number) {
      if (!canvas) return
      const pixelWidth = Math.max(1, Math.round(width * dpr))
      const pixelHeight = Math.max(1, Math.round(height * dpr))
      if (canvas.width !== pixelWidth) canvas.width = pixelWidth
      if (canvas.height !== pixelHeight) canvas.height = pixelHeight
      canvasSizeRef.current = { width: pixelWidth, height: pixelHeight }
    }

    resize(wrap.clientWidth, wrap.clientHeight)

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (!entry) return
      const box = entry.contentBoxSize?.[0]
      if (box) resize(box.inlineSize, box.blockSize)
      else resize(entry.contentRect.width, entry.contentRect.height)
    })
    observer.observe(wrap)
    return () => observer.disconnect()
  }, [])

  // --- Keyboard input -----------------------------------------------------
  // Drives both keysRef (corridor: left/right only) and carpetKeysRef (the
  // Olympus race: all four directions) unconditionally — harmless, since
  // only one of the two is ever read at a time depending on endingPhase,
  // and it means the same arrow keys / WASD work in both without the
  // player needing to think about which "mode" they're in.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'ArrowLeft' || event.key === 'a' || event.key === 'A') {
        keysRef.current.left = true
        carpetKeysRef.current.left = true
      }
      if (event.key === 'ArrowRight' || event.key === 'd' || event.key === 'D') {
        keysRef.current.right = true
        carpetKeysRef.current.right = true
      }
      if (event.key === 'ArrowUp' || event.key === 'w' || event.key === 'W') carpetKeysRef.current.up = true
      if (event.key === 'ArrowDown' || event.key === 's' || event.key === 'S') carpetKeysRef.current.down = true
      if (event.key === ' ' || event.key === 'Spacebar') {
        event.preventDefault()
        atlantisInteractRef.current()
      }
    }
    function onKeyUp(event: KeyboardEvent) {
      if (event.key === 'ArrowLeft' || event.key === 'a' || event.key === 'A') {
        keysRef.current.left = false
        carpetKeysRef.current.left = false
      }
      if (event.key === 'ArrowRight' || event.key === 'd' || event.key === 'D') {
        keysRef.current.right = false
        carpetKeysRef.current.right = false
      }
      if (event.key === 'ArrowUp' || event.key === 'w' || event.key === 'W') carpetKeysRef.current.up = false
      if (event.key === 'ArrowDown' || event.key === 's' || event.key === 'S') carpetKeysRef.current.down = false
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [])

  // --- Game loop -----------------------------------------------------------
  useEffect(() => {
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context) return
    const ctx: CanvasRenderingContext2D = context

    let lastTime = performance.now()

    function frame(time: number) {
      const dt = time - lastTime
      lastTime = time
      frameRef.current += 1

      const { width: liveWidth, height: liveHeight } = canvasSizeRef.current
      ctx.save()
      ctx.clearRect(0, 0, liveWidth, liveHeight)
      applyCoverTransform(ctx, liveWidth, liveHeight, CANVAS_WIDTH, CANVAS_HEIGHT)

      const ending = endingRef.current
      const currentEndingPhase = endingPhaseRef.current

      if (currentEndingPhase === 'atlantis') {
        advanceAtlantisPlayer(atlantisPlayerRef.current, keysRef.current, dt)
        renderAtlantisFrame(ctx, atlantisQuestRef.current, atlantisPlayerRef.current, time)
        ctx.restore()
        rafRef.current = window.requestAnimationFrame(frame)
        return
      }

      if (
        currentEndingPhase === 'poseidon-greeting' ||
        currentEndingPhase === 'poseidon-free' ||
        currentEndingPhase === 'poseidon-exiting'
      ) {
        // A distinct throne room, not the palace floor the player was just
        // exploring — Poseidon seated between two guards, mirroring the
        // Sphinx's own ending chamber (a seated greeting, then a walk into
        // the light on the player's own button press, not a timer).
        const poseidon = poseidonRef.current
        poseidon.appear = Math.min(1, poseidon.appear + dt / 1000 / 1.4)
        if (currentEndingPhase === 'poseidon-exiting') {
          poseidon.exitFlash = Math.min(1, poseidon.exitFlash + dt / 1000 / 0.6)
        }
        renderPoseidonThroneScene(ctx, poseidon, time)
        drawPlayer(ctx, CANVAS_WIDTH / 2 - 220, POSEIDON_GROUND_Y, 1, false, time)
        ctx.restore()
        rafRef.current = window.requestAnimationFrame(frame)
        return
      }

      if (currentEndingPhase === 'olympus') {
        const race = olympusRaceRef.current
        race.appear = Math.min(1, race.appear + dt / 1000 / 1.2)

        if (!race.finished && !completingRoomRef.current) {
          advanceCarpet(carpetPlayerRef.current, carpetKeysRef.current, dt)
          const justCollected = collectNearbyCoins(race, carpetPlayerRef.current)
          if (justCollected > 0) {
            coinsCollectedRef.current += justCollected
            setOlympusCoinsCollected(coinsCollectedRef.current)
          }
          if (allCoinsCollected(race) && reachedFinish(carpetPlayerRef.current)) {
            race.finished = true
            raceFinishedRef.current()
          }
        }

        const cameraX = Math.max(
          0,
          Math.min(OLYMPUS_WORLD_WIDTH - OLYMPUS_CANVAS_WIDTH, carpetPlayerRef.current.x - OLYMPUS_CANVAS_WIDTH / 2),
        )
        const cameraY = Math.max(
          0,
          Math.min(OLYMPUS_WORLD_HEIGHT - OLYMPUS_CANVAS_HEIGHT, carpetPlayerRef.current.y - OLYMPUS_CANVAS_HEIGHT / 2),
        )
        renderOlympusRace(ctx, { race, player: carpetPlayerRef.current, cameraX, cameraY }, time)
        ctx.restore()
        rafRef.current = window.requestAnimationFrame(frame)
        return
      }

      if (currentEndingPhase !== null && currentEndingPhase !== 'won') {
        // The ending sequence owns the frame once it starts — the corridor
        // underneath is done being simulated.
        advanceEnding(ending, dt)
        drawEndingFrame(ctx, ending, currentEndingPhase, time)
        ctx.restore()
        rafRef.current = window.requestAnimationFrame(frame)
        return
      }

      if (currentEndingPhase === 'won') {
        const waitingRoom = waitingRoomRef.current
        waitingRoom.appear = Math.min(1, waitingRoom.appear + dt / 1000 / 1.5)
        renderWaitingRoom(ctx, waitingRoom, time)
        ctx.restore()
        rafRef.current = window.requestAnimationFrame(frame)
        return
      }

      const state = stateRef.current
      const signal = update(state, keysRef.current, dt)

      if (signal?.kind === 'zone' && state.phase === 'explore') {
        state.phase = 'riddle'
        state.activeZoneIndex = signal.riddleIndex
        setPhase('riddle')
        setOverlay({ kind: 'speaking' })
        setTypedText('')
        setHintText(null)
      } else if (signal?.kind === 'door' && state.phase === 'explore') {
        state.phase = 'ending'
        setPhase('ending')
        setEndingPhase('chamber-entering')
      }

      let shake = { x: 0, y: 0 }
      if (state.phase === 'attack' && attackStartRef.current !== null) {
        const elapsed = time - attackStartRef.current
        const shakeIntensity = Math.min(4, elapsed / 400)
        shake = shakeOffset(frameRef.current, shakeIntensity)
      }

      const doorLit = state.solvedZones.size >= ZONES.length
      render(ctx, state, time, doorLit)

      if (state.phase === 'attack' && attackStartRef.current !== null) {
        const elapsed = time - attackStartRef.current
        const progress = Math.min(1, elapsed / ATTACK_DURATION_MS)
        ctx.save()
        drawAttack(ctx, progress, shake.x, shake.y)
        ctx.restore()
      }

      ctx.restore()
      rafRef.current = window.requestAnimationFrame(frame)
    }

    rafRef.current = window.requestAnimationFrame(frame)
    return () => {
      if (rafRef.current !== null) window.cancelAnimationFrame(rafRef.current)
    }
  }, [])

  // --- Ending sequence: chamber entry -> greeting -> free walk -> exit -----
  useEffect(() => {
    if (endingPhase === 'chamber-entering') {
      const ending = endingRef.current
      ending.sphinxAppear = 0
      ending.doorGlow = 0
      ending.exitFlash = 0
      ending.playerX = 260
      const timeout = window.setTimeout(() => setEndingPhase('chamber-greeting'), 1400)
      return () => window.clearTimeout(timeout)
    }
    if (endingPhase === 'chamber-greeting') {
      const timeout = window.setTimeout(() => setEndingPhase('chamber-free'), 2600)
      return () => window.clearTimeout(timeout)
    }
    if (endingPhase === 'poseidon-greeting') {
      poseidonRef.current = createPoseidonSceneState()
      const timeout = window.setTimeout(() => setEndingPhase('poseidon-free'), 2600)
      return () => window.clearTimeout(timeout)
    }
    if (endingPhase === 'poseidon-exiting') {
      const timeout = window.setTimeout(() => setEndingPhase('olympus'), 1400)
      return () => window.clearTimeout(timeout)
    }
    if (endingPhase === 'olympus') {
      olympusRaceRef.current = createOlympusRaceState()
      carpetPlayerRef.current = createCarpetPlayer()
      coinsCollectedRef.current = 0
      setOlympusCoinsCollected(0)
      setOlympusTimeLeftMs(OLYMPUS_RACE_TIME_MS)
      setOlympusMessage(null)
    }
    return undefined
  }, [endingPhase])

  function handleWalkIntoDoor() {
    if (endingPhase !== 'chamber-free') return
    setEndingPhase('exiting')
    window.setTimeout(() => {
      atlantisQuestRef.current = createAtlantisQuestState()
      atlantisPlayerRef.current = { x: 80, facing: 1, walking: false, cameraX: 0 }
      setAtlantisTimeLeftMs(ATLANTIS_QUEST_TIME_MS)
      setAtlantisFeedback(null)
      setCarryingId(null)
      setEndingPhase('atlantis')
    }, 1800)
  }

  function handleWalkIntoPoseidonsLight() {
    if (endingPhase !== 'poseidon-free') return
    setEndingPhase('poseidon-exiting')
  }

  /**
   * The third heart lost, anywhere in room-03 — resets the WHOLE room, not
   * just whichever half was active (ADR-0066). Wipes the server's room-03
   * progress via onResetRoom(), then puts both the corridor's local engine
   * state and the Atlantis quest state back to their own starting points, so
   * whichever one the player lands in next (the corridor, always — a full
   * reset always starts back at riddle 1) is genuinely fresh.
   */
  async function resetWholeRoom(message: string) {
    setResettingRoom(true)
    setAtlantisFeedback(message)
    try {
      await onResetRoom()
    } finally {
      const state = stateRef.current
      state.solvedZones.clear()
      state.player.x = 80
      state.phase = 'explore'
      state.activeZoneIndex = null
      atlantisQuestRef.current = createAtlantisQuestState()
      atlantisPlayerRef.current = { x: 80, facing: 1, walking: false, cameraX: 0 }
      setHearts(3)
      setPhase('explore')
      setEndingPhase(null)
      setCarryingId(null)
      window.setTimeout(() => setAtlantisFeedback(null), 2200)
      setResettingRoom(false)
    }
  }

  // --- Atlantis quest: countdown + click-to-interact -----------------------
  useEffect(() => {
    if (endingPhase !== 'atlantis') return

    const interval = window.setInterval(() => {
      const quest = atlantisQuestRef.current
      quest.timeLeftMs = Math.max(0, quest.timeLeftMs - 100)
      setAtlantisTimeLeftMs(quest.timeLeftMs)

      if (quest.timeLeftMs <= 0) {
        window.clearInterval(interval)
        // Timed out before all three were placed — costs a heart, same as a
        // wrong placement. Runs through setHearts's updater so it reads the
        // latest value rather than one captured when this interval started.
        setHearts((current) => {
          const next = current - 1
          if (next <= 0) {
            void resetWholeRoom("Poseidon's patience ran out. The trial begins again.")
            return 0
          }
          atlantisQuestRef.current = createAtlantisQuestState()
          atlantisPlayerRef.current.x = 80
          setAtlantisTimeLeftMs(ATLANTIS_QUEST_TIME_MS)
          setAtlantisFeedback("Poseidon's patience ran out. Begin again.")
          setCarryingId(null)
          window.setTimeout(() => setAtlantisFeedback(null), 2000)
          return next
        })
      }
    }, 100)

    return () => window.clearInterval(interval)
  }, [endingPhase])

  function handleAtlantisInteract() {
    if (endingPhase !== 'atlantis' || resettingRoom) return
    const quest = atlantisQuestRef.current
    const result = tryInteract(quest, atlantisPlayerRef.current.x)

    if (result.kind === 'found') {
      const artifact = ARTIFACTS.find((a) => a.id === result.id)
      setCarryingId(result.id)
      setAtlantisFeedback(artifact ? `You found ${artifact.name}. Carry it to its pedestal.` : 'Found something.')
      window.setTimeout(() => setAtlantisFeedback(null), 2200)
    } else if (result.kind === 'placed-correct') {
      setCarryingId(null)
      setAtlantisFeedback('It settles into place.')
      window.setTimeout(() => setAtlantisFeedback(null), 1600)
      if (isQuestComplete(quest)) {
        window.setTimeout(() => setEndingPhase('poseidon-greeting'), 1600)
      }
    } else if (result.kind === 'placed-wrong') {
      // The artifact goes back to hidden (see game/scenes.ts's
      // tryInteract) — it has to be found again, it doesn't just vanish.
      // Still costs a heart and ten seconds, same as before.
      setAtlantisTimeLeftMs(quest.timeLeftMs)
      setCarryingId(null)
      setHearts((current) => {
        const next = current - 1
        if (next <= 0) {
          void resetWholeRoom('Wrong pedestal — Poseidon has lost patience. The trial begins again.')
          return 0
        }
        setAtlantisFeedback('Wrong pedestal — it slips away. Ten seconds lost, and a heart with it. Find it again.')
        window.setTimeout(() => setAtlantisFeedback(null), 2200)
        return next
      })
    }
  }

  // The keydown listener above is registered once on mount and needs the
  // latest handleAtlantisInteract closure (which itself closes over
  // endingPhase) — mirrored into a ref, same pattern as endingPhaseRef.
  const atlantisInteractRef = useRef(handleAtlantisInteract)
  atlantisInteractRef.current = handleAtlantisInteract

  // --- Typewriter for the riddle text --------------------------------------
  useEffect(() => {
    if (overlay.kind !== 'speaking' || !data) return
    setTypedText('')
    let index = 0
    const interval = window.setInterval(() => {
      index += 1
      setTypedText(data.riddleText.slice(0, index))
      if (index >= data.riddleText.length) {
        window.clearInterval(interval)
        setOverlay({ kind: 'asking', selected: null, submitting: false })
      }
    }, 26)
    return () => window.clearInterval(interval)
  }, [overlay.kind, data?.riddleText])

  // --- Countdown timer, once the question is actually asked ----------------
  useEffect(() => {
    if (overlay.kind !== 'asking') {
      setTimeLeftMs(null)
      return
    }
    const deadline = performance.now() + RIDDLE_TIME_LIMIT_MS
    setTimeLeftMs(RIDDLE_TIME_LIMIT_MS)

    const interval = window.setInterval(() => {
      const remaining = deadline - performance.now()
      if (remaining <= 0) {
        window.clearInterval(interval)
        setTimeLeftMs(0)
        void handleSubmit(null) // timeout — submit nothing, server reports it wrong
      } else {
        setTimeLeftMs(remaining)
      }
    }, 100)

    return () => window.clearInterval(interval)
  }, [overlay.kind, riddleIndex])

  async function handleSubmit(letterOverride: string | null) {
    if (overlay.kind !== 'asking') return
    const letter = letterOverride ?? overlay.selected
    setOverlay({ kind: 'asking', selected: overlay.selected, submitting: true })

    const result = await onSubmit(letter ?? '')
    const state = stateRef.current

    if (result.correct) {
      if (state.activeZoneIndex !== null) state.solvedZones.add(state.activeZoneIndex)
      state.phase = 'explore'
      state.activeZoneIndex = null
      setPhase('explore')
      setOverlay({ kind: 'result', feedback: result.feedback ?? null })
      window.setTimeout(() => setOverlay({ kind: 'none' }), 1400)
    } else {
      state.phase = 'attack'
      setPhase('attack')
      setOverlay({ kind: 'none' })
      setWrongFeedback(result.feedback ?? 'Wrong.')
      attackStartRef.current = performance.now()
      window.setTimeout(() => {
        // A wrong answer costs a heart and re-asks the SAME riddle now
        // (ADR-0066) — solvedZones is left alone here. The effect below
        // watches the server's own riddleIndex and is what actually clears
        // it, and only when the server reports a genuine restart to riddle 1
        // (the third heart lost), not on every miss.
        state.player.x = 80
        state.phase = 'explore'
        state.activeZoneIndex = null
        attackStartRef.current = null
        setPhase('explore')
        setWrongFeedback(null)
        forceRerender((n) => n + 1)
      }, ATTACK_DURATION_MS)
    }
  }

  // --- Olympus carpet race: countdown + finish handling --------------------
  useEffect(() => {
    if (endingPhase !== 'olympus') return

    const interval = window.setInterval(() => {
      const race = olympusRaceRef.current
      if (race.finished || completingRoomRef.current) return
      race.timeLeftMs = Math.max(0, race.timeLeftMs - 100)
      setOlympusTimeLeftMs(race.timeLeftMs)

      if (race.timeLeftMs <= 0) {
        // Ran out before all ten coins + the finish line — costs a heart,
        // same severity as an Atlantis timeout, and restarts just the race.
        setHearts((current) => {
          const next = current - 1
          if (next <= 0) {
            void resetWholeRoom("Zeus's patience ran out. The trial begins again.")
            return 0
          }
          olympusRaceRef.current = createOlympusRaceState()
          carpetPlayerRef.current = createCarpetPlayer()
          coinsCollectedRef.current = 0
          setOlympusCoinsCollected(0)
          setOlympusTimeLeftMs(OLYMPUS_RACE_TIME_MS)
          setOlympusMessage("Time's up — begin again.")
          window.setTimeout(() => setOlympusMessage(null), 2000)
          return next
        })
      }
    }, 100)

    return () => window.clearInterval(interval)
  }, [endingPhase])

  /**
   * All ten coins collected and the finish gate reached — the race is won.
   * Tells the server room-03 is actually done now (POST .../complete,
   * ADR-0070 — there is no more server-checked answer to hang this off of,
   * since Atlantis and this race are both entirely client-side), then moves
   * to the waiting room. `onRoomFinished()` is NOT called here — per
   * ADR-0069 that's reserved for the waiting room's own "Finish" button, so
   * the app doesn't advance past room-03 until the player has actually seen
   * the closing scene.
   */
  async function handleOlympusRaceFinished() {
    setCompletingRoom(true)
    setOlympusMessage('The gate opens.')
    try {
      await onCompleteRoom()
    } finally {
      setCompletingRoom(false)
      setEndingPhase('won')
    }
  }
  raceFinishedRef.current = handleOlympusRaceFinished

  async function handleHint() {
    try {
      const response = await onHint()
      setHintText(response.hint)
    } catch {
      setOverlay({ kind: 'hint-error' })
    }
  }

  const solvedCount = stateRef.current.solvedZones.size
  const allSolved = solvedCount >= ZONES.length

  return (
    <section className="sphinx-chamber">
      {endingPhase === null && (
        <>
          <div className="sphinx-hud-row">
            <HieroglyphHud solvedCount={solvedCount} activeIndex={stateRef.current.activeZoneIndex} />
            <HeartsHud hearts={hearts} maxHearts={data?.maxHearts ?? 3} />
          </div>
          <p className="sphinx-riddle-count">
            {allSolved
              ? 'WALK TO THE DOOR'
              : `${data ? `RIDDLE ${data.riddleNumber} OF ${data.riddleCount}` : 'WALK TOWARD THE SPHINX'}`}
          </p>
        </>
      )}

      <div className="sphinx-canvas-wrap" ref={canvasWrapRef}>
        <canvas
          ref={canvasRef}
          className={`sphinx-canvas ${endingPhase === 'atlantis' ? 'sphinx-canvas--interactive' : ''}`}
          onClick={() => {
            if (endingPhase === 'atlantis') handleAtlantisInteract()
          }}
        />

        {(endingPhase === 'atlantis' || endingPhase === 'olympus') && (
          <div className="sphinx-hearts--atlantis">
            <HeartsHud hearts={hearts} maxHearts={data?.maxHearts ?? 3} tone="gold" />
          </div>
        )}

        {phase === 'riddle' && data && (
          <div className="sphinx-dialogue">
            <p className="sphinx-speaker">THE SPHINX</p>
            {data.riddleTitle && <p className="sphinx-riddle-title">{data.riddleTitle}</p>}

            <p className="sphinx-line">
              {overlay.kind === 'speaking' ? typedText : data.riddleText}
            </p>

            {overlay.kind === 'asking' && (
              <>
                <div className="sphinx-timer">
                  <Hourglass fraction={timeLeftMs !== null ? 1 - timeLeftMs / RIDDLE_TIME_LIMIT_MS : 0} />
                  <span>{timeLeftMs !== null ? Math.ceil(timeLeftMs / 1000) : '--'}s</span>
                </div>

                <div className="sphinx-choices">
                  {data.choices.map((choice) => (
                    <button
                      key={choice.letter}
                      type="button"
                      onClick={() =>
                        setOverlay({ kind: 'asking', selected: choice.letter, submitting: overlay.submitting })
                      }
                      aria-pressed={overlay.selected === choice.letter}
                      className={`sphinx-choice ${overlay.selected === choice.letter ? 'sphinx-choice--selected' : ''}`}
                    >
                      <span className="sphinx-choice-letter">{choice.letter}</span>
                      {choice.text}
                    </button>
                  ))}
                </div>

                <div className="sphinx-actions">
                  <button
                    type="button"
                    onClick={() => void handleSubmit(null)}
                    disabled={!overlay.selected || overlay.submitting}
                    className="sphinx-answer-button"
                  >
                    {overlay.submitting ? 'The Sphinx considers…' : 'Speak your answer'}
                  </button>
                  <button type="button" onClick={() => void handleHint()} className="sphinx-hint-button">
                    Ask for a hint
                  </button>
                </div>

                {hintText && <p className="sphinx-hint">{hintText}</p>}
              </>
            )}

            {overlay.kind === 'hint-error' && (
              <p className="sphinx-line sphinx-line--alarm">No hints left for this riddle.</p>
            )}
          </div>
        )}

        {overlay.kind === 'result' && (
          <div className="sphinx-dialogue sphinx-dialogue--result">
            <p className="sphinx-line">{overlay.feedback}</p>
          </div>
        )}

        {phase === 'attack' && (
          <div className="sphinx-dialogue sphinx-dialogue--result">
            <Portrait posture="looming" eyeGlow="#ffffff" awake />
            <p className="sphinx-speaker">THE SPHINX</p>
            <p className="sphinx-line sphinx-line--alarm">{wrongFeedback ?? 'Wrong.'}</p>
          </div>
        )}

        {(endingPhase === 'chamber-greeting' || endingPhase === 'chamber-free') && (
          <div className="sphinx-dialogue sphinx-dialogue--gold">
            <p className="sphinx-speaker">THE SPHINX</p>
            <p className="sphinx-line">You have answered every question I asked. Few ever do.</p>
            <p className="sphinx-line">
              Beyond that light lies Poseidon's palace. Three of his treasures have gone missing from
              their pedestals — find all three, and set each one back where it belongs.
            </p>
            <p className="sphinx-line sphinx-line--post">Go. The light ahead is yours to walk into.</p>
            {endingPhase === 'chamber-free' && (
              <button
                type="button"
                onClick={handleWalkIntoDoor}
                className="sphinx-answer-button"
                style={{ marginTop: '1.25rem' }}
              >
                Walk into the light
              </button>
            )}
          </div>
        )}

        {(endingPhase === 'poseidon-greeting' || endingPhase === 'poseidon-free') && (
          <div className="sphinx-dialogue sphinx-dialogue--gold">
            <p className="sphinx-speaker">POSEIDON</p>
            <p className="sphinx-line">Every treasure returned to where it belongs. Few mortals are trusted with even one.</p>
            <p className="sphinx-line sphinx-line--post">Go now — Olympus itself has heard of you.</p>
            {endingPhase === 'poseidon-free' && (
              <button
                type="button"
                onClick={handleWalkIntoPoseidonsLight}
                className="sphinx-answer-button"
                style={{ marginTop: '1.25rem' }}
              >
                Walk into the light
              </button>
            )}
          </div>
        )}

        {endingPhase === 'atlantis' && (
          <>
            <div className="sphinx-timer sphinx-timer--atlantis">
              <Hourglass fraction={1 - atlantisTimeLeftMs / ATLANTIS_QUEST_TIME_MS} />
              <span>{Math.ceil(atlantisTimeLeftMs / 1000)}s</span>
            </div>
            {carryingId && (
              <p className="sphinx-carrying-banner">
                Carrying {ARTIFACTS.find((a) => a.id === carryingId)?.name ?? 'an artifact'} — find its pedestal
              </p>
            )}
            {atlantisFeedback && (
              <div className="sphinx-dialogue sphinx-dialogue--gold sphinx-dialogue--caption-only">
                <p className="sphinx-line">{atlantisFeedback}</p>
              </div>
            )}
          </>
        )}

        {endingPhase === 'olympus' && (
          <>
            <div className="sphinx-timer sphinx-timer--atlantis">
              <Hourglass fraction={1 - olympusTimeLeftMs / OLYMPUS_RACE_TIME_MS} />
              <span>{Math.ceil(olympusTimeLeftMs / 1000)}s</span>
            </div>
            <p className="sphinx-carrying-banner">
              {olympusCoinsCollected} / {OLYMPUS_COIN_COUNT} coins
              {olympusCoinsCollected >= OLYMPUS_COIN_COUNT ? ' — reach the gate!' : ''}
            </p>
            {olympusMessage && (
              <div className="sphinx-dialogue sphinx-dialogue--gold sphinx-dialogue--caption-only">
                <p className="sphinx-line">{olympusMessage}</p>
              </div>
            )}
          </>
        )}

        {endingPhase === 'won' && (
          <div className="sphinx-dialogue sphinx-dialogue--result sphinx-dialogue--finale">
            <p className="sphinx-speaker">???</p>
            <p className="sphinx-line sphinx-line--post">Your journey across worlds is complete.</p>
            <p className="sphinx-line">
              The Sphinx of the sands, the lord of Atlantis, and the gods of Olympus themselves have
              nothing left to ask of you. Rest now — you have earned it.
            </p>
            <button
              type="button"
              onClick={() => onRoomFinished()}
              className="sphinx-answer-button"
              style={{ marginTop: '1.5rem' }}
            >
              Finish
            </button>
          </div>
        )}
      </div>

      <p className="sphinx-hint-text">
        {endingPhase === null && 'Walk with the arrow keys or A / D. Find the sealed door.'}
        {endingPhase === 'atlantis' &&
          'Find Poseidon\'s three missing treasures and place each on its matching pedestal. Walk with the arrow keys or A / D. Click, or press Space, near an artifact or pedestal.'}
        {endingPhase === 'olympus' &&
          'Fly with the arrow keys or WASD. Collect all ten coins, then reach the gate at the far end.'}
      </p>
    </section>
  )
}

/**
 * Scales+translates the context so drawing at the fixed design resolution
 * (designWidth x designHeight) fills the live canvas edge-to-edge, cropping
 * whichever axis has excess instead of leaving it as blank bars — the same
 * effect as CSS `object-fit: cover`, applied by hand because the drawing
 * code below (render.ts, ending.ts, atlantis.ts) is written entirely in the
 * fixed design coordinate space and would be error-prone to make literally
 * responsive one hand-tuned pixel offset at a time.
 */
function applyCoverTransform(
  ctx: CanvasRenderingContext2D,
  liveWidth: number,
  liveHeight: number,
  designWidth: number,
  designHeight: number,
): void {
  const scale = Math.max(liveWidth / designWidth, liveHeight / designHeight)
  const offsetX = (liveWidth - designWidth * scale) / 2
  const offsetY = (liveHeight - designHeight * scale) / 2
  ctx.translate(offsetX, offsetY)
  ctx.scale(scale, scale)
}

function advanceEnding(ending: EndingSceneState, dtMs: number): void {
  const dt = dtMs / 1000
  ending.sphinxAppear = Math.min(1, ending.sphinxAppear + dt * 0.7)
}

function drawEndingFrame(
  ctx: CanvasRenderingContext2D,
  ending: EndingSceneState,
  phase: EndingPhase,
  time: number,
): void {
  if (phase === 'chamber-free') {
    ending.doorGlow = Math.min(1, ending.doorGlow + 0.01)
  }
  if (phase === 'exiting') {
    ending.exitFlash = Math.min(1, ending.exitFlash + 0.03)
    ending.doorGlow = 1
  }

  renderEndingScene(ctx, ending, time)

  if (phase !== 'exiting' || ending.exitFlash < 0.9) {
    drawPlayer(ctx, ending.playerX, ENDING_GROUND_Y, ending.facing, false, time)
  }
}

interface AtlantisPlayer {
  x: number
  facing: 1 | -1
  walking: boolean
  cameraX: number
}

/** Same left/right walking rules as the corridor, scoped to the Atlantis palace's own world width. */
function advanceAtlantisPlayer(player: AtlantisPlayer, keys: KeysDown, dtMs: number): void {
  const dt = dtMs / 1000
  const direction = (keys.right ? 1 : 0) - (keys.left ? 1 : 0)

  player.walking = direction !== 0
  if (direction !== 0) player.facing = direction > 0 ? 1 : -1

  const proposed = player.x + direction * ATLANTIS_PLAYER_SPEED * dt
  player.x = Math.max(20, Math.min(ATLANTIS_WORLD_WIDTH - 20, proposed))
  player.cameraX = Math.max(0, Math.min(ATLANTIS_WORLD_WIDTH - ATLANTIS_CANVAS_WIDTH, player.x - ATLANTIS_CANVAS_WIDTH / 2))
}

function renderAtlantisFrame(
  ctx: CanvasRenderingContext2D,
  quest: AtlantisQuestState,
  player: AtlantisPlayer,
  time: number,
): void {
  const renderState: AtlantisRenderState = { quest, playerX: player.x, cameraX: player.cameraX, appear: 1 }
  renderAtlantisScene(ctx, renderState, time)
  drawPlayer(ctx, player.x - player.cameraX, ATLANTIS_GROUND_Y, player.facing, player.walking, time)
}
