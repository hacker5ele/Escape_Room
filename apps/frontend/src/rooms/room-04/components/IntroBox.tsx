import { useEffect, useState } from 'react'
import { AnswerInput } from './AnswerInput'

const ANSWER = 'yes'
const INTRO_TEXT = 'You wake in a bare white cell. You have to find the last living plants to save your planet.'
const OBJECTIVE_TEXT = 'Answer the questions correctly.'
const TEXT_SWAP_DELAY = 4500
const TEXT_FADE_DURATION = 400
const QUESTION_REVEAL_DELAY = 900

interface IntroBoxProps {
  fading: boolean
  onAnswered: () => void
}

export function IntroBox({ fading, onAnswered }: IntroBoxProps) {
  const [wrong, setWrong] = useState(false)
  const [textFading, setTextFading] = useState(false)
  const [showObjective, setShowObjective] = useState(false)
  const [showQuestion, setShowQuestion] = useState(false)

  useEffect(() => {
    const timeout = setTimeout(() => setTextFading(true), TEXT_SWAP_DELAY)
    return () => clearTimeout(timeout)
  }, [])

  useEffect(() => {
    if (!textFading) return
    const timeout = setTimeout(() => {
      setShowObjective(true)
      setTextFading(false)
    }, TEXT_FADE_DURATION)
    return () => clearTimeout(timeout)
  }, [textFading])

  useEffect(() => {
    if (!showObjective) return
    const timeout = setTimeout(() => setShowQuestion(true), QUESTION_REVEAL_DELAY)
    return () => clearTimeout(timeout)
  }, [showObjective])

  function submit(value: string) {
    if (value.trim().toLowerCase() === ANSWER) {
      setWrong(false)
      onAnswered()
    } else {
      setWrong(true)
    }
  }

  return (
    <div className={`r4-intro${fading ? ' r4-intro-fading' : ''}`}>
      <div className="r4-intro-content">
        <h1>The Abandoned City</h1>
        <div className="r4-intro-text-stack">
          <p className={`r4-intro-text${showObjective || textFading ? ' r4-intro-text-hidden' : ''}`}>{INTRO_TEXT}</p>
          <p className={`r4-intro-text${showObjective && !textFading ? '' : ' r4-intro-text-hidden'}`}>
            {OBJECTIVE_TEXT}
          </p>
        </div>
        <div className={`r4-intro-question-block${showQuestion ? '' : ' r4-intro-question-reserved'}`}>
          {showQuestion && (
            <>
              <p className="r4-intro-question">Are you ready to escape?</p>
              <AnswerInput placeholder="yes" onSubmit={submit} />
              {wrong && <p className="r4-modal-wrong">Try again.</p>}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
