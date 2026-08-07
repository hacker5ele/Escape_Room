import { ModalShell } from './ModalShell'

export function InspectModal({
  open,
  title,
  lines,
  onClose,
}: {
  open: boolean
  title: string
  lines: readonly string[]
  onClose: () => void
}) {
  return (
    <ModalShell open={open} className="modal inspect-modal" icon="i" title={title} onClose={onClose}>
      <div className="modal-body">
        {lines.map((line, i) => (
          <p key={i}>{line}</p>
        ))}
      </div>
    </ModalShell>
  )
}
