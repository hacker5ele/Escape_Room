import { useEffect, useRef, useState } from 'react'
import { roomAudio } from '../audio'
import {
  CIRCUIT_GRID_COLS,
  CIRCUIT_GRID_ROWS,
  CIRCUIT_PATH,
  circuitTileKey,
  isCircuitSolved,
  randomUnsolvedRotation,
} from '../puzzles'
import { ModalShell } from './ModalShell'

export function CircuitModal({
  open,
  onSolved,
  onClose,
}: {
  open: boolean
  onSolved: (duration: number) => void
  onClose: () => void
}) {
  const [rotations, setRotations] = useState<Record<string, number>>({})
  const [solved, setSolved] = useState(false)
  const durationPromise = useRef<Promise<number> | null>(null)

  // `onSolved` is a fresh closure every time the parent re-renders (which the
  // reveal schedule itself triggers, repeatedly, once solved). Reading it via a
  // ref instead of a dependency means the "fire once, 900ms after solving"
  // effect below only ever runs once per attempt, not every re-render.
  const onSolvedRef = useRef(onSolved)
  onSolvedRef.current = onSolved

  // Fresh, guaranteed-unsolved layout every time the panel is opened.
  useEffect(() => {
    if (!open) return
    const initial: Record<string, number> = {}
    for (const tile of CIRCUIT_PATH) {
      initial[circuitTileKey(tile.row, tile.col)] = randomUnsolvedRotation(tile)
    }
    setRotations(initial)
    setSolved(false)
    durationPromise.current = null
  }, [open])

  useEffect(() => {
    if (!solved || !durationPromise.current) return
    const promise = durationPromise.current
    const timeout = setTimeout(() => void promise.then((duration) => onSolvedRef.current(duration)), 900)
    return () => clearTimeout(timeout)
  }, [solved])

  function rotateTile(row: number, col: number) {
    if (solved) return
    roomAudio.click()
    const key = circuitTileKey(row, col)
    const next = { ...rotations, [key]: ((rotations[key] ?? 0) + 1) % 4 }
    setRotations(next)
    if (isCircuitSolved(next)) {
      setSolved(true)
      roomAudio.success()
      // Started synchronously, inside the click handler, so the browser still
      // treats this as tied to the user's gesture and doesn't block autoplay.
      durationPromise.current = roomAudio.startRecordingLog()
    }
  }

  return (
    <ModalShell
      open={open}
      className="modal terminal-modal circuit-modal"
      icon="SIG"
      title="RECOVERED AUDIO LOG — LINE DAMAGED"
      onClose={onClose}
      terminal
    >
      <div className="modal-body terminal-body">
        <p className="circuit-intro">
          The recorder's dead — the line into it isn't. Reroute the run before anything will play.
        </p>
        <div className="circuit-board">
          <span className="circuit-anchor">PWR</span>
          <div className="circuit-grid">
            {Array.from({ length: CIRCUIT_GRID_ROWS }, (_, row) =>
              Array.from({ length: CIRCUIT_GRID_COLS }, (_, col) => {
                const key = circuitTileKey(row, col)
                const tile = CIRCUIT_PATH.find((t) => t.row === row && t.col === col)
                if (!tile) return <div key={key} className="circuit-cell circuit-cell-empty" />
                const rotation = rotations[key] ?? 0
                return (
                  <button
                    key={key}
                    type="button"
                    className={`circuit-cell circuit-tile circuit-${tile.shape}${solved ? ' live' : ''}`}
                    style={{ transform: `rotate(${rotation * 90}deg)` }}
                    onClick={() => rotateTile(row, col)}
                    aria-label="Rotate circuit segment"
                  />
                )
              }),
            )}
          </div>
          <span className="circuit-anchor">SPK</span>
        </div>
        {!solved && <p className="terminal-hint">Click a segment to rotate it 90°. Connect PWR to SPK.</p>}
        {solved && <p className="terminal-hint">Signal restored. Playback starting&hellip;</p>}
      </div>
    </ModalShell>
  )
}
