import { useEffect, useState } from 'react'
import { useEvent } from '../ui/useEvent'
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

  // Identity-stable, so the interval below is created once. `onDone` is written
  // inline at the call site and the lobby re-renders about sixty times a second
  // while anybody is walking — with it as a dependency the interval was rebuilt
  // every frame and never survived to its first 700ms tick.
  const done = useEvent(onDone)

  useEffect(() => {
    play('countdown')

    // The count is kept here rather than read back out of state, so nothing in
    // this interval is a state *updater*. React may call an updater twice — it
    // does under StrictMode — and an updater that plays a sound and schedules a
    // timeout would do both of those twice too.
    let remaining = 3
    let finish: number | undefined

    const timer = window.setInterval(() => {
      remaining -= 1
      setN(remaining)

      if (remaining > 0) {
        play('countdown')
        return
      }

      window.clearInterval(timer)
      play('fanfare')
      // Held briefly so the fanfare is heard as the door opening rather than as
      // something that happened on the previous screen.
      finish = window.setTimeout(done, 620)
    }, 700)

    return () => {
      window.clearInterval(timer)
      window.clearTimeout(finish)
    }
  }, [done])

  return (
    <div className="countdown" role="status" aria-live="assertive">
      <span key={n} className="countdown-number">
        {n === 0 ? 'GO' : n}
      </span>
    </div>
  )
}
