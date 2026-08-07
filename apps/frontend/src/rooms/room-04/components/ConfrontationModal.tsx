import { useState } from 'react'
import { VISIONS, STORY } from '../story'
import { Modal } from './Modal'
import { BattlefieldPuzzle } from './BattlefieldPuzzle'

const WAND_VISION = VISIONS.find((v) => v.reward === 'wand')!

interface ConfrontationModalProps {
  open: boolean
  hasWand: boolean
  banished: boolean
  onGrantWand: () => void
  onBanish: () => void
  onClose: () => void
}

export function ConfrontationModal({ open, hasWand, banished, onGrantWand, onBanish, onClose }: ConfrontationModalProps) {
  const [wrong, setWrong] = useState(false)

  if (!open) return null

  function trySolveWandVision() {
    setWrong(false)
    onGrantWand()
  }

  return (
    <Modal title="The Rune-Carved Wizard" className="r4-confrontation">
      <p className="r4-modal-flavor">{banished ? STORY.wizardBanished : STORY.wizardConfrontation}</p>

      {!banished && !hasWand && (
        <>
          <p className="r4-modal-flavor r4-warning">{STORY.wizardNeedsWand}</p>
          <p className="r4-modal-question">{WAND_VISION.question}</p>
          <BattlefieldPuzzle onCorrect={trySolveWandVision} onWrong={() => setWrong(true)} />
          {wrong && <p className="r4-modal-wrong">Nothing happens. Try again.</p>}
        </>
      )}

      <div className="r4-modal-input-row">
        {!banished && hasWand && <button onClick={onBanish}>Raise the wand</button>}
        {banished && <button onClick={onClose}>Continue</button>}
      </div>
    </Modal>
  )
}
