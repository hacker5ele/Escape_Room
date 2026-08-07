import { useEffect, useState } from 'react'
import { STORY } from '../story'
import { shadeColor, shuffle } from '../puzzles'

export function PowerRouterModal({
  open,
  connected,
  wrongAttempts,
  onConnect,
  onWrong,
}: {
  open: boolean
  connected: ReadonlySet<string>
  wrongAttempts: number
  onConnect: (color: string) => void
  onWrong: () => void
}) {
  const [leftOrder, setLeftOrder] = useState<string[]>(STORY.wireColors)
  const [rightOrder, setRightOrder] = useState<string[]>(STORY.wireColors)
  const [selected, setSelected] = useState<string | null>(null)
  const [wrongColor, setWrongColor] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setLeftOrder(shuffle(STORY.wireColors))
      setRightOrder(shuffle(STORY.wireColors))
      setSelected(null)
      setWrongColor(null)
    }
  }, [open])

  if (!open) return null

  function handleRightClick(color: string) {
    if (connected.has(color) || !selected) return
    if (selected === color) {
      onConnect(color)
      setSelected(null)
    } else {
      onWrong()
      setWrongColor(color)
      setSelected(null)
      setTimeout(() => setWrongColor(null), 400)
    }
  }

  return (
    <div className="modal-backdrop">
      <div className="modal generator-modal">
        <div className="modal-header">
          <span className="modal-icon badge">PWR</span>
          <span className="modal-title">SECTOR POWER ROUTER</span>
        </div>
        <p className="generator-instructions">
          Reroute emergency power: reconnect each line to its matching sector terminal.
        </p>
        <div className="wire-board">
          <div className="wire-column">
            {leftOrder.map((color) => (
              <div
                key={color}
                className={`wire-terminal${connected.has(color) ? ' connected' : ''}${
                  selected === color ? ' selected' : ''
                }${wrongColor === color ? ' wrong' : ''}`}
                style={{ background: color, borderColor: shadeColor(color) }}
                onClick={() => {
                  if (!connected.has(color)) setSelected(color)
                }}
              >
                LINE
              </div>
            ))}
          </div>
          <div className="wire-column">
            {rightOrder.map((color) => (
              <div
                key={color}
                className={`wire-terminal${connected.has(color) ? ' connected' : ''}${
                  wrongColor === color ? ' wrong' : ''
                }`}
                style={{ background: color, borderColor: shadeColor(color) }}
                onClick={() => handleRightClick(color)}
              >
                SECTOR
              </div>
            ))}
          </div>
        </div>
        {wrongAttempts >= 3 && <p className="terminal-hint">{STORY.wireHint}</p>}
      </div>
    </div>
  )
}
