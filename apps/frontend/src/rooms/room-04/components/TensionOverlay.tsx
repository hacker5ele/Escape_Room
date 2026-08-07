import { useEffect, useRef } from 'react'
import { play } from '../../../audio/sfx'

interface DangerLevelRef {
  current: { level: number }
}

const MAX_INTERVAL_MS = 1400
const MIN_INTERVAL_MS = 320
const TRIGGER_THRESHOLD = 0.08
const CLOSE_CALL_THRESHOLD = 0.55
const RELEASE_THRESHOLD = 0.12

export function TensionOverlay({ dangerRef }: { dangerRef: DangerLevelRef }) {
  const vignetteRef = useRef<HTMLDivElement>(null)
  const nextBeatAt = useRef(0)
  const wasEscalated = useRef(false)

  useEffect(() => {
    let frame: number
    function tick(now: number) {
      const level = dangerRef.current.level
      if (vignetteRef.current) {
        vignetteRef.current.style.opacity = String(Math.min(0.85, level * 0.85))
      }
      if (level > TRIGGER_THRESHOLD && now >= nextBeatAt.current) {
        play('heartbeat')
        nextBeatAt.current = now + MAX_INTERVAL_MS - (MAX_INTERVAL_MS - MIN_INTERVAL_MS) * level
      }
      if (level > CLOSE_CALL_THRESHOLD && !wasEscalated.current) {
        wasEscalated.current = true
        play('heartbeat')
      } else if (wasEscalated.current && level < RELEASE_THRESHOLD) {
        wasEscalated.current = false
        play('relief')
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [dangerRef])

  return <div ref={vignetteRef} className="r4-tension-vignette" />
}
