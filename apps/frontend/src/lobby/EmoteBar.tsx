import { useCallback, useRef, useState } from 'react'
import { EMOTES, EMOTE_COOLDOWN_MS, type EmoteName } from '../character/emotes'
import { play } from '../audio/sfx'

/**
 * The dances.
 *
 * A plain row rather than Fortnite's radial wheel: a wheel needs a press-and-
 * hold gesture that has to be taught, and eight buttons on one line are faster
 * for everybody and work on a phone without inventing anything.
 *
 * The cooldown is shown by draining the buttons rather than by disabling them —
 * a control that greys out for three-quarters of a second reads as broken,
 * whereas one that visibly refills reads as a rule.
 */
export function EmoteBar({
  onEmote,
  disabled = false,
}: {
  onEmote: (emote: EmoteName) => void
  disabled?: boolean
}) {
  const [cooling, setCooling] = useState(false)
  const timer = useRef<number | undefined>(undefined)

  const fire = useCallback(
    (name: EmoteName) => {
      if (cooling || disabled) {
        // Say no audibly rather than doing nothing, which reads as a dead button.
        play('click')
        return
      }
      onEmote(name)
      setCooling(true)
      window.clearTimeout(timer.current)
      timer.current = window.setTimeout(() => setCooling(false), EMOTE_COOLDOWN_MS)
    },
    [cooling, disabled, onEmote],
  )

  return (
    <div className="emote-bar" data-cooling={cooling ? '' : undefined} role="group" aria-label="Emotes">
      {EMOTES.map((emote) => (
        <button
          key={emote.id}
          type="button"
          onClick={() => fire(emote.id)}
          className="emote-key"
          aria-label={emote.label}
        >
          {emote.label}
        </button>
      ))}
    </div>
  )
}
