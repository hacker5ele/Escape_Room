import { STORY } from '../story'
import { ModalShell } from './ModalShell'

export function DnaModal({
  open,
  step,
  complete,
  onRun,
  onClose,
}: {
  open: boolean
  step: number
  complete: boolean
  onRun: () => void
  onClose: () => void
}) {
  return (
    <ModalShell
      open={open}
      className="modal terminal-modal"
      icon="DNA"
      title="DNA ANALYSIS STATION"
      onClose={onClose}
      terminal
    >
      <div className="modal-body terminal-body">
        <div className="reveal-lines">
          {STORY.dnaSequence.slice(0, step).map((line, i) => (
            <p key={i}>{line}</p>
          ))}
        </div>
        {step === 0 && (
          <button type="button" className="btn btn-terminal" onClick={onRun}>
            START ANALYSIS &gt;
          </button>
        )}
        {step > 0 && !complete && <p className="terminal-hint">Running analysis&hellip;</p>}
        {complete && <p className="terminal-hint">Analysis complete. Logged: Obsidian Rex.</p>}
      </div>
    </ModalShell>
  )
}
