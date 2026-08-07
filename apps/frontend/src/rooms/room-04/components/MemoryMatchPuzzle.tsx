import { useState } from 'react'

interface MemoryMatchPuzzleProps {
  onCorrect: () => void
}

const SYMBOLS = ['circle', 'star', 'moon'] as const
type Symbol = (typeof SYMBOLS)[number]

function shuffle<T>(values: readonly T[]): T[] {
  return [...values].sort(() => Math.random() - 0.5)
}

function Glyph({ symbol }: { symbol: Symbol }) {
  if (symbol === 'circle') return <circle cx="20" cy="20" r="12" fill="#ff9fd1" />
  if (symbol === 'star') {
    return <polygon points="20,6 24,16 35,16 26,23 29,34 20,27 11,34 14,23 5,16 16,16" fill="#ff9fd1" />
  }
  return <path d="M26 8a14 14 0 1 0 0 24 11 11 0 0 1 0-24z" fill="#ff9fd1" />
}

export function MemoryMatchPuzzle({ onCorrect }: MemoryMatchPuzzleProps) {
  const [order] = useState(() => shuffle([...SYMBOLS, ...SYMBOLS]))
  const [flipped, setFlipped] = useState<number[]>([])
  const [matched, setMatched] = useState<Set<number>>(new Set())
  const [busy, setBusy] = useState(false)

  function pick(i: number) {
    if (busy || flipped.includes(i) || matched.has(i)) return
    const next = [...flipped, i]
    setFlipped(next)
    if (next.length !== 2) return

    const [a, b] = next
    if (a === undefined || b === undefined) return
    setBusy(true)
    if (order[a] === order[b]) {
      const nextMatched = new Set(matched)
      nextMatched.add(a)
      nextMatched.add(b)
      setMatched(nextMatched)
      setFlipped([])
      setBusy(false)
      if (nextMatched.size === order.length) onCorrect()
    } else {
      setTimeout(() => {
        setFlipped([])
        setBusy(false)
      }, 700)
    }
  }

  return (
    <div className="r4-memory-grid">
      {order.map((symbol, i) => {
        const revealed = flipped.includes(i) || matched.has(i)
        return (
          <button
            key={i}
            type="button"
            aria-label={revealed ? symbol : 'Face-down card'}
            className={`r4-memory-card${revealed ? ' r4-memory-card-revealed' : ''}`}
            onClick={() => pick(i)}
          >
            {revealed && (
              <svg viewBox="0 0 40 40" width="100%" height="100%">
                <Glyph symbol={symbol} />
              </svg>
            )}
          </button>
        )
      })}
    </div>
  )
}
