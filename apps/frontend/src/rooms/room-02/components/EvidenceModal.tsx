import { STORY } from '../story'
import { ModalShell } from './ModalShell'

export function EvidenceModal({
  open,
  selected,
  wrongStreak,
  onToggle,
  onCompile,
  onClose,
}: {
  open: boolean
  selected: ReadonlySet<string>
  wrongStreak: number
  onToggle: (id: string) => void
  onCompile: () => void
  onClose: () => void
}) {
  return (
    <ModalShell open={open} className="modal evidence-modal" icon="DOC" title="EVIDENCE TERMINAL" onClose={onClose}>
      <div className="modal-body">
        <p className="lock-instructions">
          Select every document that proves the company knowingly hid the danger, then compile the package.
        </p>
        <div className="evidence-list">
          {STORY.evidenceItems.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`evidence-card${selected.has(item.id) ? ' selected' : ''}`}
              onClick={() => onToggle(item.id)}
            >
              <span className="evidence-subject">{item.subject}</span>
              <span className="evidence-body">{item.body}</span>
            </button>
          ))}
        </div>
        <button type="button" className="btn btn-danger" onClick={onCompile}>
          COMPILE EVIDENCE PACKAGE
        </button>
        {wrongStreak >= 2 && <p className="terminal-hint">{STORY.evidenceHint}</p>}
      </div>
    </ModalShell>
  )
}
