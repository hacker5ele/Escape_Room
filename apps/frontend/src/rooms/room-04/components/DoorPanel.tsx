import { STORY } from '../story'
import { AnswerInput } from './AnswerInput'

interface DoorPanelProps {
  digits: number[]
  busy: boolean
  onAnswer: (value: string) => void
}

export function DoorPanel({ digits, busy, onAnswer }: DoorPanelProps) {
  return (
    <div className="r4-door-panel">
      <div className="r4-door-visual" />
      <p className="r4-modal-flavor">{STORY.doorIntro}</p>
      <div className="r4-rune-stones">
        {digits.map((digit, i) => (
          <span key={i} className="r4-rune-stone">
            {digit}
          </span>
        ))}
      </div>
      <AnswerInput placeholder="The keypad wants a number" submitLabel={busy ? '…' : 'Enter'} disabled={busy} inputMode="numeric" onSubmit={onAnswer} />
    </div>
  )
}
