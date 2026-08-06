import type { Interaction } from './actions'

/**
 * What E does, said out loud.
 *
 * Drawn as **chrome rather than in the world**, which is not where a prompt
 * like this normally goes. Anything inside the stage is drawn in its 1600×900
 * space and scaled once to fit — about 0.2 on a 320px phone — so a tag floating
 * over the lamp would be four-pixel type nobody could read. The station itself
 * is ringed instead, and the words live down here at a readable size.
 *
 * **It is a button, not a label.** There is no E key on a phone, and rule 8
 * asks for usable rather than merely unbroken, so tapping it does exactly what
 * pressing E does.
 */
export function Prompt({ offer, onFire }: { offer: Interaction | null; onFire: () => void }) {
  if (!offer) return null

  return (
    <button
      type="button"
      className="hall-prompt pointer-events-auto"
      data-kind={offer.kind}
      onClick={onFire}
    >
      <span className="hall-prompt-key" aria-hidden="true">
        E
      </span>
      <span className="hall-prompt-label">{offer.label}</span>
    </button>
  )
}
