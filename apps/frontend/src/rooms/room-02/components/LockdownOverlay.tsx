import { useEffect } from 'react'
import { STORY } from '../story'

export function LockdownOverlay({ open, onDone }: { open: boolean; onDone: () => void }) {
  useEffect(() => {
    if (!open) return
    const timeout = setTimeout(onDone, STORY.lockdownLines.length * 800 + 1400)
    return () => clearTimeout(timeout)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  if (!open) return null
  return (
    <div className="lockdown-overlay">
      <div className="lockdown-lines">
        {STORY.lockdownLines.map((line, i) => (
          <p key={i} className="line" style={{ animationDelay: `${i * 0.8}s` }}>
            {line}
          </p>
        ))}
      </div>
    </div>
  )
}
