import { useEffect, useState } from 'react'
import type { VisionDef } from '../story'
import { VISION_TIMER } from '../story'
import { Modal } from './Modal'
import { BattlefieldPuzzle } from './BattlefieldPuzzle'
import { QuizChoices } from './QuizChoices'
import { BellPatternPuzzle } from './BellPatternPuzzle'
import { SkylinePuzzle } from './SkylinePuzzle'
import { MemoryMatchPuzzle } from './MemoryMatchPuzzle'

interface VisionModalProps {
  vision: VisionDef | null
  onSolved: (id: VisionDef['id'], reward: 'hint' | 'wand') => void
  onTimeout: () => void
  onClose: () => void
}

export function VisionModal({ vision, onSolved, onTimeout, onClose }: VisionModalProps) {
  const [wrong, setWrong] = useState(false)
  const [timeLeft, setTimeLeft] = useState(VISION_TIMER)

  useEffect(() => {
    if (!vision) return
    setTimeLeft(VISION_TIMER)
    setWrong(false)
    const interval = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          clearInterval(interval)
          onTimeout()
          return 0
        }
        return t - 1
      })
    }, 1000)
    return () => clearInterval(interval)
  }, [vision, onTimeout])

  if (!vision) return null

  function solve() {
    if (!vision) return
    setWrong(false)
    onSolved(vision.id, vision.reward)
  }

  const urgent = timeLeft <= 5

  return (
    <Modal title={vision.title} onClose={onClose}>
      <p className={`r4-vision-timer${urgent ? ' r4-vision-timer-urgent' : ''}`}>{timeLeft}s to answer</p>
      <p className="r4-modal-question">{vision.question}</p>
      {vision.interaction === 'click-image' ? (
        <BattlefieldPuzzle onCorrect={solve} onWrong={() => setWrong(true)} />
      ) : vision.interaction === 'sequence' ? (
        <BellPatternPuzzle onCorrect={solve} onWrong={() => setWrong(true)} />
      ) : vision.interaction === 'spot-difference' ? (
        <SkylinePuzzle onCorrect={solve} onWrong={() => setWrong(true)} />
      ) : vision.interaction === 'memory-match' ? (
        <MemoryMatchPuzzle onCorrect={solve} />
      ) : (
        <QuizChoices visionId={vision.id} choices={vision.choices ?? []} onCorrect={solve} onWrong={() => setWrong(true)} />
      )}
      {wrong && <p className="r4-modal-wrong">The vision does not respond. Try again.</p>}
    </Modal>
  )
}
