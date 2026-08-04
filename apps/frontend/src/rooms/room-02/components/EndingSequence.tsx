import { useEffect, useState } from 'react'
import { roomAudio } from '../audio'

export function EndingSequence({
  open,
  variant,
  lines,
  onDone,
}: {
  open: boolean
  variant: 'win' | 'death'
  lines: readonly string[]
  onDone: () => void
}) {
  const [dinoShow, setDinoShow] = useState(false)

  useEffect(() => {
    if (!open) {
      setDinoShow(false)
      return
    }
    const timeouts =
      variant === 'win'
        ? [setTimeout(() => roomAudio.roar(), 900), setTimeout(() => setDinoShow(true), 1100)]
        : [
            setTimeout(() => roomAudio.heavySteps(), 0),
            setTimeout(() => roomAudio.roar(), 0),
            setTimeout(() => setDinoShow(true), 300),
            setTimeout(() => roomAudio.scratchingMetal(), 600),
            setTimeout(() => roomAudio.roar(), 900),
          ]
    const doneTimeout = setTimeout(onDone, lines.length * 1100 + 1600)
    return () => [...timeouts, doneTimeout].forEach(clearTimeout)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, variant])

  if (!open) return null
  return (
    <div className="ending-sequence">
      <div className={`dino-silhouette${dinoShow ? ' show' : ''}`} />
      <div className="ending-lines">
        {lines.map((line, i) => (
          <p key={i} className="line" style={{ animationDelay: `${i * 1.1}s` }}>
            {line}
          </p>
        ))}
      </div>
    </div>
  )
}
