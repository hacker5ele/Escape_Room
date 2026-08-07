import { useState } from 'react'
import type { VisionDef } from '../story'
import { isVisionAnswerCorrect } from '../puzzles'

interface QuizChoicesProps {
  visionId: VisionDef['id']
  choices: readonly string[]
  disabled?: boolean
  onCorrect: () => void
  onWrong: () => void
}

export function QuizChoices({ visionId, choices, disabled, onCorrect, onWrong }: QuizChoicesProps) {
  const [wrongChoice, setWrongChoice] = useState<string | null>(null)

  function pick(choice: string) {
    if (disabled) return
    if (isVisionAnswerCorrect(visionId, choice)) {
      setWrongChoice(null)
      onCorrect()
    } else {
      setWrongChoice(choice)
      onWrong()
    }
  }

  return (
    <div className="r4-quiz-choices">
      {choices.map((choice) => (
        <button
          key={choice}
          type="button"
          className={`r4-quiz-choice${wrongChoice === choice ? ' r4-quiz-choice-wrong' : ''}`}
          onClick={() => pick(choice)}
          disabled={disabled}
        >
          {choice}
        </button>
      ))}
    </div>
  )
}
