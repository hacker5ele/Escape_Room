import { STORY } from '../story'
import { ModalShell } from './ModalShell'

export function RecordingModal({
  open,
  step,
  complete,
  onClose,
}: {
  open: boolean
  step: number
  complete: boolean
  onClose: () => void
}) {
  return (
    <ModalShell
      open={open}
      className="modal terminal-modal"
      icon="REC"
      title="RECOVERED AUDIO LOG"
      onClose={onClose}
      terminal
    >
      <div className="modal-body terminal-body">
        <div className="reveal-lines">
          {STORY.recordingLines.slice(0, step).map((line, i) => (
            <p key={i} className={line.startsWith('[') ? 'static-line' : undefined}>
              {line}
            </p>
          ))}
        </div>
        {!complete && <p className="terminal-hint">Playing recovered audio&hellip;</p>}
        {complete && <p className="terminal-hint">End of recording.</p>}
      </div>
    </ModalShell>
  )
}
