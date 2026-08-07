import { useEffect, useReducer, useRef, useState } from 'react'
import { Vector3 } from 'three'
import type { RoomProps } from '../registry'
import './style.css'
import { play } from '../../audio/sfx'
import { useEvent } from '../../ui/useEvent'
import { VISIONS, STORY, WORLD, GUARDIAN_HOMES, pathCenterX, type VisionDef } from './story'
import { createInitialState, roomReducer } from './state'
import { IntroBox } from './components/IntroBox'
import { Hud } from './components/Hud'
import { VisionModal } from './components/VisionModal'
import { ConfrontationModal } from './components/ConfrontationModal'
import { DoorPanel } from './components/DoorPanel'
import { Toast } from './components/Toast'
import { Minimap } from './components/Minimap'
import { PrizeReveal } from './components/PrizeReveal'
import { LossReveal } from './components/LossReveal'
import { RoomTimer } from './components/RoomTimer'
import { TensionOverlay } from './components/TensionOverlay'
import { RunnerScene, type RespawnRequest } from './three/RunnerScene'
import type { CharacterState } from './three/Character'

type IntroPhase = 'gate' | 'opening' | 'done'

const BOOST_DURATION = 6
const GRACE_PERIOD_MS = 9000
const ASCEND_DURATION_MS = 4200

export function Room04({ room, onAnswer, busy }: RoomProps) {
  const [state, dispatch] = useReducer(roomReducer, undefined, createInitialState)
  const [introPhase, setIntroPhase] = useState<IntroPhase>('gate')
  const [openVision, setOpenVision] = useState<VisionDef | null>(null)
  const [triggeringVisionId, setTriggeringVisionId] = useState<VisionDef['id'] | null>(null)
  const [foundVisionIds, setFoundVisionIds] = useState<Set<VisionDef['id']>>(new Set())
  const [confrontationOpen, setConfrontationOpen] = useState(false)
  const [doorReached, setDoorReached] = useState(false)
  const [celebrate, setCelebrate] = useState(false)
  const [finalCelebrate, setFinalCelebrate] = useState<'backflip' | 'dance' | null>(null)
  const [toastMessage, setToastMessage] = useState<string | null>(null)
  const [respawnRequest, setRespawnRequest] = useState<RespawnRequest | null>(null)
  const [prizeShown, setPrizeShown] = useState(false)
  const [finaleActive, setFinaleActive] = useState(false)
  const toastTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const celebrateTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const finalCelebrateTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const prizeTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const guardianCatchCooldown = useRef(false)
  const respawnNonce = useRef(0)
  const playerPos = useRef(new Vector3(0, 0, WORLD.startZ))
  const dangerRef = useRef({ level: 0 })
  const boostRef = useRef({ activeUntil: 0 })
  const checkpointZ = useRef<number>(WORLD.startZ)
  const [captureFlash, setCaptureFlash] = useState(false)
  const captureFlashTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const [boosted, setBoosted] = useState(false)
  const boostTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const boostFadeTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const [caughtReacting, setCaughtReacting] = useState(false)
  const caughtReactingTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const guardianPositions = useRef(GUARDIAN_HOMES.map((home) => new Vector3(home.x, 0, home.z))).current
  const wizardPosition = useRef(new Vector3(pathCenterX(WORLD.wizardZ), 0, WORLD.wizardZ)).current
  const movingRef = useRef({ isMoving: false })
  const graceActive = useRef(true)
  const [ascending, setAscending] = useState(false)
  const hasAscendedRef = useRef(false)
  const [lost, setLost] = useState(false)

  const paused = useRef(true)
  const stateRef = useRef(state)
  stateRef.current = state
  const introPhaseRef = useRef(introPhase)
  introPhaseRef.current = introPhase
  const finaleActiveRef = useRef(finaleActive)
  finaleActiveRef.current = finaleActive

  function showToast(message: string, duration = 3200) {
    setToastMessage(message)
    clearTimeout(toastTimeout.current)
    toastTimeout.current = setTimeout(() => setToastMessage(null), duration)
  }

  function triggerCelebrate() {
    setCelebrate(true)
    clearTimeout(celebrateTimeout.current)
    celebrateTimeout.current = setTimeout(() => setCelebrate(false), 1600)
  }

  function triggerCaptureFlash() {
    setCaptureFlash(true)
    setCaughtReacting(true)
    clearTimeout(captureFlashTimeout.current)
    captureFlashTimeout.current = setTimeout(() => setCaptureFlash(false), 500)
    clearTimeout(caughtReactingTimeout.current)
    caughtReactingTimeout.current = setTimeout(() => setCaughtReacting(false), 500)
  }

  function triggerFinalCelebrate() {
    clearTimeout(finalCelebrateTimeout.current)
    setFinalCelebrate('backflip')
    finalCelebrateTimeout.current = setTimeout(() => {
      setFinalCelebrate('dance')
      finalCelebrateTimeout.current = setTimeout(() => setFinalCelebrate(null), 2400)
    }, 1600)
  }

  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>
    function scheduleAmbient() {
      const solvedCount = stateRef.current.visionsSolved.size
      const pace = finaleActiveRef.current ? 0.3 : Math.max(0.35, 1 - solvedCount * 0.12)
      timeout = setTimeout(
        () => {
          if (introPhaseRef.current === 'done' && !paused.current && !stateRef.current.wizardBanished) {
            const lines = finaleActiveRef.current ? STORY.finaleWizardLines : STORY.ambientWizardLines
            const line = lines[Math.floor(Math.random() * lines.length)]
            if (line) showToast(line, finaleActiveRef.current ? 1800 : 3200)
          }
          scheduleAmbient()
        },
        (7000 + Math.random() * 5000) * pace,
      )
    }
    scheduleAmbient()
    return () => clearTimeout(timeout)
  }, [])

  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>
    function scheduleAmbientSound() {
      timeout = setTimeout(
        () => {
          if (introPhaseRef.current === 'done' && !paused.current) play('ambient')
          scheduleAmbientSound()
        },
        9000 + Math.random() * 6000,
      )
    }
    scheduleAmbientSound()
    return () => clearTimeout(timeout)
  }, [])

  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>
    function scheduleBeat() {
      const level = dangerRef.current.level
      const interval = 620 - level * 220
      timeout = setTimeout(() => {
        if (introPhaseRef.current === 'done' && !paused.current) play('beat')
        scheduleBeat()
      }, interval)
    }
    scheduleBeat()
    return () => clearTimeout(timeout)
  }, [])

  function handleIntroAnswered() {
    setIntroPhase('opening')
    paused.current = false
    graceActive.current = true
    setTimeout(() => {
      graceActive.current = false
    }, GRACE_PERIOD_MS)
    setTimeout(() => setIntroPhase('done'), 1600)
    setTimeout(() => {
      if (!paused.current) showToast('If one gets close, stop moving. It might not notice you.', 3600)
    }, GRACE_PERIOD_MS + 1500)
  }

  function handleReachVision(vision: VisionDef) {
    setTriggeringVisionId(vision.id)
    setTimeout(() => {
      setTriggeringVisionId(null)
      setOpenVision(vision)
      setFoundVisionIds((prev) => new Set(prev).add(vision.id))
    }, 500)
  }

  function handleVisionSolved(id: VisionDef['id'], reward: 'hint' | 'wand') {
    const vision = VISIONS.find((v) => v.id === id)
    dispatch({ type: 'SOLVE_VISION', id, reward })
    setOpenVision(null)
    if (vision) checkpointZ.current = Math.min(checkpointZ.current, vision.z)

    if (vision?.finalGate) {
      triggerFinalCelebrate()
      showToast(vision.onSolved)
      setPrizeShown(true)
      paused.current = true
      clearTimeout(prizeTimeout.current)
      prizeTimeout.current = setTimeout(() => {
        setPrizeShown(false)
        setFinaleActive(true)
        paused.current = false
        showToast('Something behind you just woke up.', 2600)
      }, 4000)
      return
    }

    paused.current = false
    triggerCelebrate()
    showToast(openVision?.onSolved ?? 'Something shifts in the city.')
  }

  function handleGuardianCaught() {
    if (guardianCatchCooldown.current) return
    guardianCatchCooldown.current = true
    setTimeout(() => {
      guardianCatchCooldown.current = false
    }, 2000)
    triggerCaptureFlash()
    respawnNonce.current += 1
    setRespawnRequest({ x: 0, z: checkpointZ.current, nonce: respawnNonce.current })
    showToast('It had you — sent back to your last checkpoint.', 2600)
  }

  function handleTimeExpired() {
    if (state.visionsSolved.size >= VISIONS.length) return
    paused.current = true
    setLost(true)
  }
  const handleTimeExpiredStable = useEvent(handleTimeExpired)

  function handleVisionTimeout() {
    triggerCaptureFlash()
    respawnNonce.current += 1
    setRespawnRequest({ x: 0, z: checkpointZ.current, nonce: respawnNonce.current })
    showToast('Too slow — sent back to your last checkpoint.', 2600)
    setOpenVision(null)
    paused.current = false
  }

  function handleVisionSkip() {
    setOpenVision(null)
    paused.current = false
  }

  function handleReachWizard() {
    setConfrontationOpen(true)
  }

  function handleGrantWand() {
    const wandVision = VISIONS.find((v) => v.reward === 'wand')
    if (wandVision) dispatch({ type: 'SOLVE_VISION', id: wandVision.id, reward: 'wand' })
  }

  function handleBanish() {
    if (!state.hasWand) return
    dispatch({ type: 'BANISH_WIZARD' })
    triggerCelebrate()
  }

  function handleConfrontationClose() {
    setConfrontationOpen(false)
    if (state.wizardBanished && !hasAscendedRef.current) {
      hasAscendedRef.current = true
      setAscending(true)
      play('ascend')
      showToast('For a moment, everything is light.', 2600)
      setTimeout(() => {
        setAscending(false)
        paused.current = false
      }, ASCEND_DURATION_MS)
      return
    }
    paused.current = false
  }

  function handleReachDoor() {
    setDoorReached(true)
    paused.current = true
  }

  function handlePowerCollected(elapsedTime: number) {
    boostRef.current.activeUntil = elapsedTime + BOOST_DURATION
    setBoosted(true)
    clearTimeout(boostTimeout.current)
    boostTimeout.current = setTimeout(() => setBoosted(false), BOOST_DURATION * 1000)
    clearTimeout(boostFadeTimeout.current)
    boostFadeTimeout.current = setTimeout(() => play('slide'), (BOOST_DURATION - 1) * 1000)
    showToast('Hastened: you move faster, and guardians are far less likely to notice you, for a few seconds.', 3200)
    play('chime')
  }

  const characterState: CharacterState = caughtReacting
    ? 'fight'
    : finalCelebrate === 'dance'
      ? 'dance'
      : finalCelebrate === 'backflip' || celebrate
        ? 'celebrate'
        : confrontationOpen && !state.wizardBanished
          ? 'fight'
          : introPhase === 'gate' || openVision || confrontationOpen || doorReached
            ? 'idle'
            : 'running'

  return (
    <div className={`room-04${captureFlash ? ' r4-shaking' : ''}`}>
      <Hud hasWand={state.hasWand} boosted={boosted} visionsFound={foundVisionIds.size} visionsTotal={VISIONS.length} />

      {introPhase === 'done' && state.visionsSolved.size < VISIONS.length && (
        <RoomTimer running paused={paused} onExpire={handleTimeExpiredStable} />
      )}

      <div className="r4-canvas-wrap">
        <RunnerScene
          playerPos={playerPos}
          paused={paused}
          visionsSolved={state.visionsSolved}
          wizardBanished={state.wizardBanished}
          finaleActive={finaleActive}
          characterState={characterState}
          introPhase={introPhase}
          triggeringVisionId={triggeringVisionId}
          respawnRequest={respawnRequest}
          dangerRef={dangerRef}
          boostRef={boostRef}
          guardianPositions={guardianPositions}
          wizardPosition={wizardPosition}
          movingRef={movingRef}
          graceActive={graceActive}
          ascending={ascending}
          onReachVision={handleReachVision}
          onReachWizard={handleReachWizard}
          onReachDoor={handleReachDoor}
          onGuardianCaught={handleGuardianCaught}
          onPowerCollected={handlePowerCollected}
        />
      </div>

      {introPhase === 'done' && <TensionOverlay dangerRef={dangerRef} />}

      {boosted && <div className="r4-boost-glow" />}

      {captureFlash && <div className="r4-capture-flash" />}

      {ascending && <div className="r4-ascension-flash" />}

      {!prizeShown && (
        <Minimap
          playerPos={playerPos}
          visionsSolved={state.visionsSolved}
          guardianPositions={finaleActive ? [] : guardianPositions}
          wizardPosition={finaleActive ? wizardPosition : null}
          tutorial={introPhase !== 'done'}
        />
      )}

      {introPhase !== 'done' && <IntroBox fading={introPhase === 'opening'} onAnswered={handleIntroAnswered} />}

      <VisionModal vision={openVision} onSolved={handleVisionSolved} onTimeout={handleVisionTimeout} onClose={handleVisionSkip} />

      <ConfrontationModal
        open={confrontationOpen}
        hasWand={state.hasWand}
        banished={state.wizardBanished}
        onGrantWand={handleGrantWand}
        onBanish={handleBanish}
        onClose={handleConfrontationClose}
      />

      {doorReached && !prizeShown && (
        <div className="r4-door-overlay">
          <DoorPanel
            digits={(room.data.digits as number[] | undefined) ?? []}
            busy={busy}
            onAnswer={(value) => onAnswer(Number(value))}
          />
        </div>
      )}

      <PrizeReveal open={prizeShown} />

      <LossReveal open={lost} />

      <Toast message={toastMessage} />
    </div>
  )
}
