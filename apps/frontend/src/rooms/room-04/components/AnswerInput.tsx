import { useState } from 'react'

interface AnswerInputProps {
  placeholder: string
  submitLabel?: string
  disabled?: boolean
  inputMode?: 'text' | 'numeric'
  onSubmit: (value: string) => void
}

export function AnswerInput({ placeholder, submitLabel = 'Answer', disabled, inputMode = 'text', onSubmit }: AnswerInputProps) {
  const [value, setValue] = useState('')

  function submit() {
    if (!value.trim() || disabled) return
    onSubmit(value.trim())
  }

  return (
    <div className="r4-modal-input-row">
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && submit()}
        placeholder={placeholder}
        inputMode={inputMode}
        disabled={disabled}
        autoFocus
      />
      <button onClick={submit} disabled={disabled}>
        {submitLabel}
      </button>
    </div>
  )
}
