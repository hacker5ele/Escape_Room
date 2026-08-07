import { useEffect, useState } from 'react'

export const ROOM_TIME_LIMIT = 210

interface RoomTimerProps {
  running: boolean
  paused: React.MutableRefObject<boolean>
  onExpire: () => void
}

function formatTime(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

export function RoomTimer({ running, paused, onExpire }: RoomTimerProps) {
  const [remaining, setRemaining] = useState(ROOM_TIME_LIMIT)

  useEffect(() => {
    if (!running) return
    const interval = setInterval(() => {
      if (paused.current) return
      setRemaining((t) => {
        if (t <= 1) {
          onExpire()
          return ROOM_TIME_LIMIT
        }
        return t - 1
      })
    }, 1000)
    return () => clearInterval(interval)
  }, [running, paused, onExpire])

  const urgent = remaining <= 30

  return <div className={`r4-room-timer${urgent ? ' r4-room-timer-urgent' : ''}`}>{formatTime(remaining)}</div>
}
