import { useEffect, useReducer, useRef, useState } from 'react'
import type { RoomProps } from '../types'
import './style.css'
import { roomAudio } from './audio'
import { LOCATIONS, type LocationId } from './locations'
import { STORY, type LockKind } from './story'
import { createInitialState, roomReducer, type RoomState } from './state'
import { isEvidenceSelectionCorrect, isLockAnswerCorrect } from './puzzles'
import { TitleScreen } from './components/TitleScreen'
import { Hud } from './components/Hud'
import { Scene } from './components/Scene'
import { InventoryBar } from './components/InventoryBar'
import { TravelTransition } from './components/TravelTransition'
import { InspectModal } from './components/InspectModal'
import { DnaModal } from './components/DnaModal'
import { CircuitModal } from './components/CircuitModal'
import { RecordingModal } from './components/RecordingModal'
import { TerminalModal } from './components/TerminalModal'
import { LockModal } from './components/LockModal'
import { EvidenceModal } from './components/EvidenceModal'
import { PowerRouterModal } from './components/PowerRouterModal'
import { LockdownOverlay } from './components/LockdownOverlay'
import { FinalSprint } from './components/FinalSprint'
import { EndingSequence } from './components/EndingSequence'
import { EndScreen } from './components/EndScreen'
import { Toast } from './components/Toast'

type ModalKind =
  | 'inspect'
  | 'dna'
  | 'circuit'
  | 'recording'
  | 'terminal'
  | 'lock'
  | 'evidence'
  | 'powerRouter'
  | null
type Screen = 'title' | 'game' | 'end'
type EndingVariant = 'win' | 'death'

function getObjective(state: RoomState): string {
  if (!state.dnaComplete || !state.recordingComplete) {
    return 'Analyze the DNA sample and recover the audio log.'
  }
  if (!state.terminalUnlocked) return 'Find facility access, then use the security terminal.'
  if (state.currentLocation === 'lab') return 'Proceed to the Security Control Room.'
  if (!state.evidenceCompiled) return 'Compile proof of the cover-up and extract it.'
  if (!state.powerRestored)
    return "Clock's running — restore power to the corridor evacuation route."
  if (!state.locksSolved.has('exit')) {
    return 'Get to the emergency exit and clear the override before time runs out.'
  }
  return 'Reach the emergency exit.'
}

export function Room02({ onSubmit }: RoomProps) {
  const [state, dispatch] = useReducer(roomReducer, undefined, createInitialState)
  const [screen, setScreen] = useState<Screen>('title')
  const [muted, setMuted] = useState(false)
  const [shake, setShake] = useState(false)
  const [staticFlash, setStaticFlash] = useState(false)

  const [openModal, setOpenModal] = useState<ModalKind>(null)
  const [inspectContent, setInspectContent] = useState<{ title: string; lines: string[] } | null>(
    null,
  )
  const [currentLockKind, setCurrentLockKind] = useState<LockKind | null>(null)
  const [travelLocationName, setTravelLocationName] = useState<string | null>(null)

  const [lockdownTextVisible, setLockdownTextVisible] = useState(false)
  const [finalSprintActive, setFinalSprintActive] = useState(false)
  const finalSprintTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const [endingSequenceOpen, setEndingSequenceOpen] = useState(false)
  const [endingVariant, setEndingVariant] = useState<EndingVariant | null>(null)

  const [toastMessage, setToastMessage] = useState<string | null>(null)
  const [toastKey, setToastKey] = useState(0)
  const toastTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const [timerRemaining, setTimerRemaining] = useState<number | null>(null)
  const timerInterval = useRef<ReturnType<typeof setInterval> | undefined>(undefined)
  const timerDeadline = useRef<number>(0)

  const recordingTimeouts = useRef<ReturnType<typeof setTimeout>[]>([])
  const dnaTimeouts = useRef<ReturnType<typeof setTimeout>[]>([])

  // Keep the latest state/screen reachable from timers without re-subscribing effects.
  const stateRef = useRef(state)
  stateRef.current = state
  const screenRef = useRef(screen)
  screenRef.current = screen

  function showToast(message: string, duration = 2800) {
    setToastMessage(message)
    setToastKey((k) => k + 1)
    clearTimeout(toastTimeout.current)
    toastTimeout.current = setTimeout(() => setToastMessage(null), duration)
  }

  function triggerShake() {
    setShake(true)
    setTimeout(() => setShake(false), 500)
  }

  // ---- Ambient dinosaur presence, runs for the whole component lifetime ----
  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>
    function scheduleAmbient() {
      const delay = 6000 + Math.random() * 6000
      timeout = setTimeout(() => {
        if (screenRef.current === 'game') {
          // In bounds by construction — the index is drawn from the array's own length.
          const line = STORY.ambientLines[Math.floor(Math.random() * STORY.ambientLines.length)]!
          switch (Math.floor(Math.random() * 5)) {
            case 0:
            case 1:
              roomAudio.distantRoar()
              break
            case 2:
              roomAudio.heavySteps()
              break
            case 3:
              roomAudio.scratchingMetal()
              break
            default:
              roomAudio.staticBurst()
              setStaticFlash(false)
              requestAnimationFrame(() => {
                setStaticFlash(true)
                setTimeout(() => setStaticFlash(false), 600)
              })
          }
          showToast(line, 3200)
        }
        scheduleAmbient()
      }, delay)
    }
    scheduleAmbient()
    return () => clearTimeout(timeout)
  }, [])

  // ---- Title / restart ----------------------------------------------------
  function handleEnter() {
    roomAudio.startAmbient()
    setScreen('game')
  }

  function handleRestart() {
    dispatch({ type: 'RESET' })
    roomAudio.stopSirenLoop()
    roomAudio.stopRecordingLog()
    clearRecordingSchedule()
    clearDnaSchedule()
    stopEscapeTimer()
    setShake(false)
    setScreen('title')
    setOpenModal(null)
    setInspectContent(null)
    setCurrentLockKind(null)
    setTravelLocationName(null)
    setLockdownTextVisible(false)
    clearTimeout(finalSprintTimeout.current)
    setFinalSprintActive(false)
    setEndingSequenceOpen(false)
    setEndingVariant(null)
  }

  function toggleMute() {
    const next = !muted
    roomAudio.setMuted(next)
    setMuted(next)
  }

  // ---- Travel ---------------------------------------------------------------
  function travelTo(id: LocationId) {
    if (!state.unlockedLocations.has(id)) return
    setTravelLocationName(LOCATIONS[id].name)
    setTimeout(() => {
      dispatch({ type: 'TRAVEL_TO', location: id })
      setTravelLocationName(null)
      if (id === 'corridor' && !stateRef.current.corridorEntered) {
        dispatch({ type: 'MARK_CORRIDOR_ENTERED' })
        showToast(STORY.corridorEntry)
      }
    }, 900)
  }

  // ---- Hotspot routing --------------------------------------------------------
  function handleHotspotClick(id: string) {
    roomAudio.click()
    switch (id) {
      case 'dnaStation':
        setOpenModal('dna')
        break
      case 'recording':
        if (state.circuitSolved) {
          setOpenModal('recording')
          void roomAudio.startRecordingLog().then(scheduleRecordingReveal)
        } else {
          setOpenModal('circuit')
        }
        break
      case 'terminal':
        setOpenModal('terminal')
        break
      case 'locker':
        if (state.locksSolved.has('locker')) {
          setInspectContent({ title: 'Storage Locker', lines: [...STORY.lockerOpened] })
          setOpenModal('inspect')
        } else {
          setCurrentLockKind('locker')
          setOpenModal('lock')
        }
        break
      case 'footprints':
        setInspectContent({ title: 'Claw Marks', lines: [...STORY.flavor.footprints] })
        setOpenModal('inspect')
        break
      case 'equipment':
        setInspectContent({ title: 'Wrecked Equipment', lines: [...STORY.flavor.equipment] })
        setOpenModal('inspect')
        break
      case 'statusBoard':
        setInspectContent({ title: 'Containment Status', lines: [...STORY.containmentStatus] })
        setOpenModal('inspect')
        break
      case 'evidenceDesk':
        if (state.locksSolved.has('evidence')) {
          setOpenModal('evidence')
        } else {
          setCurrentLockKind('evidence')
          setOpenModal('lock')
        }
        break
      case 'powerRouter':
        if (state.powerRestored) {
          setInspectContent({
            title: 'Sector Power Router',
            lines: ['Power is already restored. The corridor route is open.'],
          })
          setOpenModal('inspect')
        } else {
          dispatch({ type: 'RESET_WIRE_BOARD' })
          setOpenModal('powerRouter')
        }
        break
      case 'cameraFeed':
        handleCameraFeed()
        break
      case 'exitDoor':
        handleExitDoor()
        break
    }
  }

  function handleCameraFeed() {
    setInspectContent({ title: 'Camera Feed', lines: [...STORY.cameraFeedLines] })
    setOpenModal('inspect')
    if (!state.cameraJumpTriggered) {
      dispatch({ type: 'MARK_CAMERA_JUMP_TRIGGERED' })
      setTimeout(() => {
        roomAudio.roar()
        triggerShake()
      }, 900)
    }
  }

  // ---- Generic code locks (locker / evidence terminal / exit) ------------------
  async function submitLock(kind: LockKind, value: string): Promise<boolean> {
    if (kind === 'exit') {
      try {
        const result = await onSubmit(value)
        if (result.correct) {
          roomAudio.success()
          dispatch({ type: 'SOLVE_LOCK', kind })
          setOpenModal(null)
          showToast('Override accepted. Blast door releasing.')
          proceedThroughExit()
          return true
        }
        dispatch({ type: 'FAIL_LOCK', kind })
        return false
      } catch {
        showToast('Could not reach the server. Try again.')
        return false
      }
    }

    const correct = isLockAnswerCorrect(kind, value)
    if (correct) {
      roomAudio.success()
      dispatch({ type: 'SOLVE_LOCK', kind })
      setOpenModal(null)
      onLockSolved(kind)
      return true
    }
    dispatch({ type: 'FAIL_LOCK', kind })
    return false
  }

  function onLockSolved(kind: 'locker' | 'evidence') {
    if (kind === 'locker') {
      dispatch({ type: 'ADD_ITEM', item: 'badge' })
      dispatch({ type: 'ADD_ITEM', item: 'screwdriver' })
      dispatch({ type: 'ADD_ITEM', item: 'usb' })
      setInspectContent({ title: 'Storage Locker', lines: [...STORY.lockerOpened] })
      setOpenModal('inspect')
      showToast('Locker unlocked. Badge, screwdriver, and USB drive added.')
    } else {
      showToast('Access granted.')
      setOpenModal('evidence')
    }
  }

  // ---- Circuit repair (gates the recovered audio log) -------------------------
  // Playback was already started by CircuitModal itself, synchronously inside the
  // winning click, so the browser doesn't treat it as unrequested autoplay.
  function handleCircuitSolved(duration: number) {
    dispatch({ type: 'SOLVE_CIRCUIT' })
    setOpenModal('recording')
    scheduleRecordingReveal(duration)
  }

  // ---- DNA / recording steppers -----------------------------------------------
  function clearDnaSchedule() {
    dnaTimeouts.current.forEach(clearTimeout)
    dnaTimeouts.current = []
  }

  /** Runs the whole DNA sequence after one click instead of one line per click. */
  function handleDnaRun() {
    clearDnaSchedule()
    const startIndex = stateRef.current.dnaStep
    const total = STORY.dnaSequence.length
    for (let i = startIndex; i < total; i++) {
      dnaTimeouts.current.push(
        setTimeout(
          () => {
            dispatch({ type: 'ADVANCE_DNA' })
            roomAudio.click()
          },
          (i - startIndex + 1) * 900,
        ),
      )
    }
  }

  function clearRecordingSchedule() {
    recordingTimeouts.current.forEach(clearTimeout)
    recordingTimeouts.current = []
  }

  // Cue points (seconds into recovered_audio_log.mp3) for the first four lines, timed
  // by ear against the real recording: opening line right at the start, then the two
  // "[SIGNAL DEGRADED]" dropouts at ~4-6s and ~10-11s, with the dialogue lines revealed
  // as soon as each dropout clears rather than lagging behind the spoken audio.
  const RECORDING_CUE_SECONDS = [0.1, 5, 6, 10.5] as const

  /** Reveals the remaining log lines timed against the real clip, instead of a manual click-through. */
  function scheduleRecordingReveal(duration: number) {
    clearRecordingSchedule()
    const startIndex = stateRef.current.recordingStep
    const total = STORY.recordingLines.length
    const lastCue = RECORDING_CUE_SECONDS[RECORDING_CUE_SECONDS.length - 1] ?? 0
    for (let lineIndex = startIndex; lineIndex < total; lineIndex++) {
      const line = STORY.recordingLines[lineIndex]
      const cueSeconds = RECORDING_CUE_SECONDS[lineIndex] ?? Math.min(lastCue + 1, duration - 0.5)
      const delayMs = Math.max(0, cueSeconds * 1000)
      recordingTimeouts.current.push(
        setTimeout(() => {
          dispatch({ type: 'ADVANCE_RECORDING' })
          if (line?.startsWith('[')) {
            roomAudio.staticBurst()
            setStaticFlash(false)
            requestAnimationFrame(() => {
              setStaticFlash(true)
              setTimeout(() => setStaticFlash(false), 600)
            })
          }
        }, delayMs),
      )
    }
  }

  // ---- Security terminal ----------------------------------------------------
  function handleTerminalProceed() {
    dispatch({ type: 'SET_TERMINAL_UNLOCKED' })
    dispatch({ type: 'UNLOCK_LOCATION', location: 'control' })
    setOpenModal(null)
    showToast('Route logged. Security Control Room is now accessible.')
  }

  // ---- Evidence compilation ---------------------------------------------------
  function handleCompileEvidence() {
    if (!state.inventory.has('usb')) {
      showToast(STORY.evidenceNeedsUSB)
      return
    }
    const correct = isEvidenceSelectionCorrect(state.evidenceSelected)
    if (correct) {
      dispatch({ type: 'EVIDENCE_COMPILED' })
      setOpenModal(null)
      triggerLockdown()
    } else {
      dispatch({ type: 'EVIDENCE_WRONG' })
      showToast(STORY.evidenceWrong)
    }
  }

  // ---- Lockdown ---------------------------------------------------------------
  function triggerLockdown() {
    dispatch({ type: 'SET_LOCKDOWN_ACTIVE' })
    triggerShake()
    setLockdownTextVisible(true)
    roomAudio.startSirenLoop()
    startEscapeTimer()
  }

  function handleLockdownDone() {
    setLockdownTextVisible(false)
    showToast(STORY.timerStartedToast)
  }

  // ---- Power router -----------------------------------------------------------
  function handlePowerConnect(color: string) {
    dispatch({ type: 'CONNECT_WIRE', color })
    roomAudio.success()
    const nowConnected = new Set(state.wiresConnected)
    nowConnected.add(color)
    if (nowConnected.size === STORY.wireColors.length) {
      setTimeout(() => {
        setOpenModal(null)
        roomAudio.stopSirenLoop()
        dispatch({ type: 'SET_POWER_RESTORED' })
        dispatch({ type: 'UNLOCK_LOCATION', location: 'corridor' })
        showToast('POWER RESTORED — corridor route open.')
      }, 500)
    }
  }

  function handleWireWrong() {
    dispatch({ type: 'WIRE_WRONG' })
  }

  // ---- Containment corridor / exit --------------------------------------------
  function handleExitDoor() {
    if (state.gameOver) return
    if (!state.powerRestored) {
      setInspectContent({ title: 'Emergency Exit', lines: [...STORY.exitLocked] })
      setOpenModal('inspect')
    } else if (!state.locksSolved.has('exit')) {
      setCurrentLockKind('exit')
      setOpenModal('lock')
    } else {
      proceedThroughExit()
    }
  }

  function proceedThroughExit() {
    setFinalSprintActive(true)
    roomAudio.running()
    finalSprintTimeout.current = setTimeout(() => {
      setFinalSprintActive(false)
      startEndingSequence('win')
    }, 2600)
  }

  // ---- Ending -------------------------------------------------------------------
  function startEndingSequence(variant: EndingVariant) {
    if (stateRef.current.gameOver) return
    dispatch({ type: 'SET_GAME_OVER' })
    stopEscapeTimer()
    triggerShake()
    setEndingVariant(variant)
    setEndingSequenceOpen(true)
  }

  function handleEndingDone() {
    setEndingSequenceOpen(false)
    roomAudio.stopSirenLoop()
    setScreen('end')
  }

  // ---- Escape timer -------------------------------------------------------------
  function startEscapeTimer() {
    timerDeadline.current = Date.now() + STORY.escapeTimeSeconds * 1000
    tickEscapeTimer()
    timerInterval.current = setInterval(tickEscapeTimer, 250)
  }

  function tickEscapeTimer() {
    const remainingMs = timerDeadline.current - Date.now()
    const remaining = Math.max(0, Math.ceil(remainingMs / 1000))
    setTimerRemaining(remaining)
    if (remainingMs <= 0) {
      stopEscapeTimer()
      triggerDeath()
    }
  }

  function stopEscapeTimer() {
    clearInterval(timerInterval.current)
    timerInterval.current = undefined
    setTimerRemaining(null)
  }

  function triggerDeath() {
    if (stateRef.current.gameOver) return
    setOpenModal(null)
    setLockdownTextVisible(false)
    startEndingSequence('death')
  }

  useEffect(() => stopEscapeTimer, [])

  const timerDisplay =
    timerRemaining === null
      ? null
      : {
          text: `${Math.floor(timerRemaining / 60)}:${String(timerRemaining % 60).padStart(2, '0')}`,
          critical: timerRemaining <= Math.min(20, STORY.escapeTimeSeconds * 0.25),
        }

  return (
    <div className={`room-02${shake ? ' shake' : ''}${state.lockdownActive ? ' lockdown' : ''}`}>
      <div className="fx-layer flicker" />
      <div className="fx-layer lockdown-wash" />
      <div className="fx-layer vignette" />
      <div className={`fx-layer flash${staticFlash ? ' active' : ''}`} />

      {screen === 'title' && <TitleScreen onEnter={handleEnter} />}

      {screen !== 'title' && !finalSprintActive && (
        <>
          <Hud
            locationTitle={LOCATIONS[state.currentLocation].name}
            objective={getObjective(state)}
            timer={timerDisplay}
            currentLocation={state.currentLocation}
            unlockedLocations={state.unlockedLocations}
            onNavigate={travelTo}
            muted={muted}
            onToggleMute={toggleMute}
            onRestart={handleRestart}
          />
          <Scene location={LOCATIONS[state.currentLocation]} onHotspotClick={handleHotspotClick} />
          <InventoryBar inventory={state.inventory} />
        </>
      )}

      {finalSprintActive && (
        <FinalSprint
          background={LOCATIONS[state.currentLocation].background}
          lines={STORY.exitUnlocked}
        />
      )}

      <TravelTransition locationName={travelLocationName} />

      <InspectModal
        open={openModal === 'inspect'}
        title={inspectContent?.title ?? ''}
        lines={inspectContent?.lines ?? []}
        onClose={() => setOpenModal(null)}
      />
      <DnaModal
        open={openModal === 'dna'}
        step={state.dnaStep}
        complete={state.dnaComplete}
        onRun={handleDnaRun}
        onClose={() => {
          setOpenModal(null)
          clearDnaSchedule()
        }}
      />
      <CircuitModal
        open={openModal === 'circuit'}
        onSolved={handleCircuitSolved}
        onClose={() => setOpenModal(null)}
      />
      <RecordingModal
        open={openModal === 'recording'}
        step={state.recordingStep}
        complete={state.recordingComplete}
        onClose={() => {
          setOpenModal(null)
          roomAudio.stopRecordingLog()
          clearRecordingSchedule()
        }}
      />
      <TerminalModal
        open={openModal === 'terminal'}
        hasBadge={state.inventory.has('badge')}
        dnaComplete={state.dnaComplete}
        recordingComplete={state.recordingComplete}
        terminalUnlocked={state.terminalUnlocked}
        onProceed={handleTerminalProceed}
        onClose={() => setOpenModal(null)}
      />
      <LockModal
        open={openModal === 'lock'}
        kind={currentLockKind}
        attempts={currentLockKind ? state.lockAttempts[currentLockKind] : 0}
        onSubmit={(value) => submitLock(currentLockKind as LockKind, value)}
        onClose={() => setOpenModal(null)}
      />
      <EvidenceModal
        open={openModal === 'evidence'}
        selected={state.evidenceSelected}
        wrongStreak={state.evidenceWrongStreak}
        onToggle={(id) => dispatch({ type: 'TOGGLE_EVIDENCE', id })}
        onCompile={handleCompileEvidence}
        onClose={() => setOpenModal(null)}
      />
      <PowerRouterModal
        open={openModal === 'powerRouter'}
        connected={state.wiresConnected}
        wrongAttempts={state.wireWrongAttempts}
        onConnect={handlePowerConnect}
        onWrong={handleWireWrong}
      />

      <LockdownOverlay open={lockdownTextVisible} onDone={handleLockdownDone} />
      <EndingSequence
        open={endingSequenceOpen}
        variant={endingVariant ?? 'win'}
        lines={endingVariant === 'death' ? STORY.deathLines : STORY.endingLines}
        onDone={handleEndingDone}
      />
      <EndScreen
        open={screen === 'end'}
        failure={endingVariant === 'death'}
        title={endingVariant === 'death' ? 'CONTAINMENT FAILURE' : 'MISSION COMPLETE'}
        subtitle={endingVariant === 'death' ? STORY.deathSubtitle : STORY.endingSubtitle}
        flavor={endingVariant === 'death' ? STORY.deathFlavor : STORY.endingFlavor}
        onPlayAgain={handleRestart}
      />

      <Toast message={toastMessage} toastKey={toastKey} />
    </div>
  )
}
