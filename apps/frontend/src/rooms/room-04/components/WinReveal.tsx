import { Modal } from './Modal'

interface WinRevealProps {
  open: boolean
  onLeave: () => void
}

export function WinReveal({ open, onLeave }: WinRevealProps) {
  if (!open) return null

  return (
    <Modal title="You escaped">
      <p className="r4-modal-flavor">
        All five visions are found, and the last living plants of the abandoned city are safe. Your planet has a
        chance.
      </p>
      <div className="r4-modal-input-row">
        <button type="button" onClick={onLeave}>
          Leave the room
        </button>
      </div>
    </Modal>
  )
}
