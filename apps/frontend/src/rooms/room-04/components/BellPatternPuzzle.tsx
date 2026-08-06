import { useEffect, useState } from 'react'
import { play, type SoundName } from '../../../audio/sfx'

const BELL_SOUNDS: readonly SoundName[] = ['bell1', 'bell2', 'bell3', 'bell4']
const SEQUENCE_LENGTH = 6
const REVEAL_HOLD_MS = 340
const REVEAL_GAP_MS = 480

interface BellPatternPuzzleProps {
  onCorrect: () => void
  onWrong: () => void
}

export function BellPatternPuzzle({ onCorrect, onWrong }: BellPatternPuzzleProps) {
  const [sequence] = useState(() => Array.from({ length: SEQUENCE_LENGTH }, () => Math.floor(Math.random() * 4)))
  const [revealing, setRevealing] = useState(true)
  const [activeBell, setActiveBell] = useState<number | null>(null)
  const [inputIndex, setInputIndex] = useState(0)
  const [wrongBell, setWrongBell] = useState<number | null>(null)

  useEffect(() => {
    let cancelled = false
    async function reveal() {
      await new Promise((resolve) => setTimeout(resolve, 500))
      for (const bell of sequence) {
        if (cancelled) return
        setActiveBell(bell)
        play(BELL_SOUNDS[bell] ?? 'bell1')
        await new Promise((resolve) => setTimeout(resolve, REVEAL_HOLD_MS))
        if (cancelled) return
        setActiveBell(null)
        await new Promise((resolve) => setTimeout(resolve, REVEAL_GAP_MS - REVEAL_HOLD_MS))
      }
      if (!cancelled) setRevealing(false)
    }
    reveal()
    return () => {
      cancelled = true
    }
  }, [sequence])

  function pick(bell: number) {
    if (revealing) return
    play(BELL_SOUNDS[bell] ?? 'bell1')
    if (bell === sequence[inputIndex]) {
      const next = inputIndex + 1
      if (next >= sequence.length) {
        onCorrect()
      } else {
        setInputIndex(next)
      }
    } else {
      setWrongBell(bell)
      setTimeout(() => setWrongBell(null), 300)
      setInputIndex(0)
      onWrong()
    }
  }

  return (
    <div className="r4-bell-puzzle">
      <p className="r4-bell-status">{revealing ? 'Listen...' : 'Now repeat it'}</p>
      <div className="r4-bell-row">
        {[0, 1, 2, 3].map((bell) => (
          <button
            key={bell}
            type="button"
            aria-label={`Bell ${bell + 1}`}
            className={`r4-bell${activeBell === bell ? ' r4-bell-active' : ''}${wrongBell === bell ? ' r4-bell-wrong' : ''}`}
            onClick={() => pick(bell)}
            disabled={revealing}
          />
        ))}
      </div>
    </div>
  )
}
