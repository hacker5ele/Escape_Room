import { STORY } from '../story'
import { ModalShell } from './ModalShell'

export function TerminalModal({
  open,
  hasBadge,
  dnaComplete,
  recordingComplete,
  terminalUnlocked,
  onProceed,
  onClose,
}: {
  open: boolean
  hasBadge: boolean
  dnaComplete: boolean
  recordingComplete: boolean
  terminalUnlocked: boolean
  onProceed: () => void
  onClose: () => void
}) {
  let lines: readonly string[]
  let showProceed = false

  if (!hasBadge) {
    lines = [STORY.terminalNoBadge]
  } else if (!(dnaComplete && recordingComplete)) {
    lines = [STORY.terminalIncomplete]
  } else {
    lines = STORY.terminalUnlocked
    showProceed = !terminalUnlocked
  }

  return (
    <ModalShell
      open={open}
      className="modal terminal-modal"
      icon="SYS"
      title="SECURITY TERMINAL"
      onClose={onClose}
      terminal
    >
      <div className="modal-body terminal-body">
        <div className="reveal-lines">
          {lines.map((line, i) => (
            <p key={i}>{line}</p>
          ))}
        </div>
        {showProceed && (
          <button type="button" className="btn btn-terminal" onClick={onProceed}>
            PROCEED TO CONTROL ROOM &gt;
          </button>
        )}
      </div>
    </ModalShell>
  )
}
