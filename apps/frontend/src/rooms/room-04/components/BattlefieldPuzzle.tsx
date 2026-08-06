import { useState } from 'react'

interface BattlefieldPuzzleProps {
  onCorrect: () => void
  onWrong: () => void
}

interface Hotspot {
  id: string
  label: string
  left: number
  top: number
  width: number
  height: number
}

const HOTSPOTS: readonly Hotspot[] = [
  { id: 'sky', label: 'The sky', left: 0, top: 0, width: 100, height: 13 },
  { id: 'tank', label: 'The wrecked tank', left: 46, top: 8, width: 32, height: 32 },
  { id: 'scar', label: 'The cratered ground', left: 14, top: 54, width: 56, height: 42 },
]

export function BattlefieldPuzzle({ onCorrect, onWrong }: BattlefieldPuzzleProps) {
  const [wrongId, setWrongId] = useState<string | null>(null)

  function pick(id: string) {
    if (id === 'scar') {
      setWrongId(null)
      onCorrect()
    } else {
      setWrongId(id)
      onWrong()
    }
  }

  return (
    <div className="r4-battlefield-photo-frame">
      <img
        src="/rooms/room-04/battlefield/shell-torn-ground.jpg"
        alt="A World War One photograph of a wrecked tank in a shell torn, cratered field"
        className="r4-battlefield-photo"
      />
      {HOTSPOTS.map((spot) => (
        <button
          key={spot.id}
          type="button"
          aria-label={spot.label}
          className={`r4-battlefield-hotspot${wrongId === spot.id ? ' r4-battlefield-wrong' : ''}`}
          style={{ left: `${spot.left}%`, top: `${spot.top}%`, width: `${spot.width}%`, height: `${spot.height}%` }}
          onClick={() => pick(spot.id)}
        />
      ))}
    </div>
  )
}
