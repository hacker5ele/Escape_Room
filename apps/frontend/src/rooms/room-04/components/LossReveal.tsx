import { Modal } from './Modal'

interface LossRevealProps {
  open: boolean
}

export function LossReveal({ open }: LossRevealProps) {
  if (!open) return null

  return (
    <Modal title="You lost">
      <p className="r4-modal-flavor">
        Time ran out before you found all five boxes. The city keeps its secrets, and the wizard still
        holds the path.
      </p>
      <div className="r4-modal-input-row">
        <button type="button" onClick={() => window.location.reload()}>
          Try again
        </button>
      </div>
    </Modal>
  )
}
