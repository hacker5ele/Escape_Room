import { useEffect, useRef, useState } from 'react'
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

  // Held in a ref, and the effect depends on nothing.
  //
  // This is the whole bug it replaces. `onDone` is written inline at the call
  // site, so it is a new function on every render — and the lobby re-renders
  // about sixty times a second while anybody is walking. With `onDone` in the
  // dependency array the interval was torn down and recreated every frame, so
  // it never survived long enough to reach 700ms. The countdown could not
  // count.
  const done = useRef(onDone)
  done.current = onDone

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
      finish = window.setTimeout(() => done.current(), 620)
    }, 700)

    return () => {
      window.clearInterval(timer)
      window.clearTimeout(finish)
    }
  }, [])

  return (
    <div className="countdown" role="status" aria-live="assertive">
      <span key={n} className="countdown-number">
        {n === 0 ? 'GO' : n}
      </span>
    </div>
  )
}
