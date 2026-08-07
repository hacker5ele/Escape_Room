import { useState } from 'react'

interface SkylinePuzzleProps {
  onCorrect: () => void
  onWrong: () => void
}

const ZONE_COLS = 4
const ZONE_ROWS = 2
const CORRECT_ZONE = 5

const MARKER_LEFT = 37.5
const MARKER_TOP = 74

export function SkylinePuzzle({ onCorrect, onWrong }: SkylinePuzzleProps) {
  const [wrongZone, setWrongZone] = useState<number | null>(null)

  function pick(zone: number) {
    if (zone === CORRECT_ZONE) {
      setWrongZone(null)
      onCorrect()
    } else {
      setWrongZone(zone)
      onWrong()
    }
  }

  return (
    <div className="r4-skyline-photo-frame">
      <img
        src="/rooms/room-04/skyline/window-front.jpg"
        alt="A real photograph of an apartment building at night, rows of lit and unlit windows"
        className="r4-skyline-photo"
      />
      <div
        className="r4-skyline-marker"
        style={{ left: `${MARKER_LEFT}%`, top: `${MARKER_TOP}%` }}
      />
      {Array.from({ length: ZONE_COLS * ZONE_ROWS }, (_, i) => {
        const col = i % ZONE_COLS
        const row = Math.floor(i / ZONE_COLS)
        return (
          <button
            key={i}
            type="button"
            aria-label={`Section ${i + 1}`}
            className={`r4-skyline-zone${wrongZone === i ? ' r4-battlefield-wrong' : ''}`}
            style={{
              left: `${(col / ZONE_COLS) * 100}%`,
              top: `${(row / ZONE_ROWS) * 100}%`,
              width: `${100 / ZONE_COLS}%`,
              height: `${100 / ZONE_ROWS}%`,
            }}
            onClick={() => pick(i)}
          />
        )
      })}
    </div>
  )
}
