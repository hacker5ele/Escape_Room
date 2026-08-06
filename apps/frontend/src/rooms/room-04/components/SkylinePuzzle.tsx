import { useState } from 'react'

interface SkylinePuzzleProps {
  onCorrect: () => void
  onWrong: () => void
}

const BUILDING_COUNT = 8
const BUILDING_WIDTH = 38
const BUILDING_GAP = 12
const WINDOW_ROWS = 6
const WINDOW_COLS = 2

function randomIndex(count: number): number {
  return Math.floor(Math.random() * count)
}

export function SkylinePuzzle({ onCorrect, onWrong }: SkylinePuzzleProps) {
  const [oddBuilding] = useState(() => randomIndex(BUILDING_COUNT))
  const [oddRow] = useState(() => randomIndex(WINDOW_ROWS))
  const [oddCol] = useState(() => randomIndex(WINDOW_COLS))
  const [wrongId, setWrongId] = useState<number | null>(null)

  function pick(i: number) {
    if (i === oddBuilding) {
      setWrongId(null)
      onCorrect()
    } else {
      setWrongId(i)
      onWrong()
    }
  }

  return (
    <svg viewBox="0 0 400 220" className="r4-skyline-svg" role="img" aria-label="A city skyline at dusk">
      <rect x="0" y="0" width="400" height="220" fill="#1b1f27" />
      {Array.from({ length: BUILDING_COUNT }, (_, i) => {
        const x = 6 + i * (BUILDING_WIDTH + BUILDING_GAP)
        return (
          <g
            key={i}
            className={`r4-battlefield-target${wrongId === i ? ' r4-battlefield-wrong' : ''}`}
            onClick={() => pick(i)}
            role="button"
            aria-label={`Building ${i + 1}`}
          >
            <rect x={x} y="50" width={BUILDING_WIDTH} height="160" fill="#3a4152" stroke="#5a6478" strokeWidth="2" />
            {Array.from({ length: WINDOW_ROWS }, (_, row) =>
              Array.from({ length: WINDOW_COLS }, (_, col) => {
                const dark = i === oddBuilding && row === oddRow && col === oddCol
                return (
                  <rect
                    key={`${row}-${col}`}
                    x={x + 6 + col * 16}
                    y={62 + row * 24}
                    width="10"
                    height="14"
                    fill={dark ? '#1b1f27' : '#ffcf7a'}
                  />
                )
              }),
            )}
          </g>
        )
      })}
    </svg>
  )
}
