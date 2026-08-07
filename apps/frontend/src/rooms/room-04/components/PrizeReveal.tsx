import { Modal } from './Modal'
import { PrizeModel } from './PrizeModel'

interface PrizeRevealProps {
  open: boolean
}

export function PrizeReveal({ open }: PrizeRevealProps) {
  if (!open) return null

  return (
    <Modal title="You found it" className="r4-prize-reveal">
      <div className="r4-modal-model r4-prize-glow">
        <PrizeModel />
      </div>
      <p className="r4-modal-flavor">The last living plants of the abandoned city, alive after all. Your journey ends here.</p>
    </Modal>
  )
}
