import { useEffect, useState } from 'react'
import { play } from '../audio/sfx'

/**
 * Three, two, one.
 *
 * The moment that makes pressing PLAY feel like a decision rather than a page
 * change. Each number stamps in over a dimmed stage with `countdown`; the last
 * beat is `fanfare` and then the room.
 *
 * Under `prefers-reduced-motion` the numbers still count — they simply do not
 * fly. Skipping straight to the room would remove the beat everybody needs to
 * realise the game has started.
 */
export function Countdown({ onDone }: { onDone: () => void }) {
  const [n, setN] = useState(3)

  useEffect(() => {
    play('countdown')

    const timer = window.setInterval(() => {
      setN((current) => {
        const next = current - 1
        if (next <= 0) {
          window.clearInterval(timer)
          play('fanfare')
          // Held briefly so the fanfare is heard as the door opening rather
          // than as something that happened in the previous screen.
          window.setTimeout(onDone, 620)
          return 0
        }
        play('countdown')
        return next
      })
    }, 700)

    return () => window.clearInterval(timer)
  }, [onDone])

  return (
    <div className="countdown" role="status" aria-live="assertive">
      <span key={n} className="countdown-number">
        {n === 0 ? 'GO' : n}
      </span>
    </div>
  )
}
