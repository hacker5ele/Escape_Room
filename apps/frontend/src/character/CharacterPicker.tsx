import { useCallback, useEffect, useRef, useState } from 'react'
import { CharacterFigure } from './CharacterFigure'
import {
  SLOTS,
  SLOT_LABELS,
  type Character,
  type Slot,
  partUrl,
  partsIn,
  preloadParts,
  randomCharacter,
} from './parts'

/**
 * Build your character.
 *
 * Eighty options is a lot to put in front of somebody who only wants to start
 * playing, so the screen is arranged to make the fast path the obvious one:
 *
 *   - It **opens on a finished random character**, never an empty outline.
 *     Changing the bits you dislike is a far easier question than assembling a
 *     person from nothing, and anybody who does not care can just press on.
 *   - **One slot at a time.** Twenty thumbnails is a glanceable grid; eighty is
 *     a wall.
 *   - **Arrows beside the figure** cycle the current slot without moving your
 *     eyes off the character, which is where the change actually shows.
 *   - **Left and right arrow keys** do the same thing, because the grid is a
 *     radio group and that is what a radio group does.
 */
export function CharacterPicker({
  onConfirm,
  onCancel,
  initial,
  replacesExistingPhoto = false,
}: {
  onConfirm: (character: Character) => Promise<void>
  /** Offered only when there is something to go back to — i.e. when editing. */
  onCancel?: () => void
  /** The character to open on. Omitted at sign-up, where a random one is right. */
  initial?: Character
  /** Whether confirming will overwrite a picture the player already had. */
  replacesExistingPhoto?: boolean
}) {
  const [character, setCharacter] = useState<Character>(() => initial ?? randomCharacter())
  const [slot, setSlot] = useState<Slot>('head')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const gridRef = useRef<HTMLDivElement | null>(null)

  // Every part, fetched before anybody clicks anything. The catalogue is under
  // a megabyte and the alternative is the figure changing a beat after the
  // click, which reads as the app being slow rather than an image loading.
  useEffect(() => {
    void preloadParts()
  }, [])

  const options = partsIn(slot)
  const index = options.findIndex((part) => part.id === character[slot])

  const choose = useCallback(
    (id: string) => setCharacter((current) => ({ ...current, [slot]: id })),
    [slot],
  )

  /** Move `step` options along in the current slot, wrapping at both ends. */
  const cycle = useCallback(
    (step: number) => {
      const next = options[(index + step + options.length) % options.length]
      if (next) choose(next.id)
    },
    [options, index, choose],
  )

  const onGridKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const steps: Record<string, number> = {
      ArrowRight: 1,
      ArrowDown: 1,
      ArrowLeft: -1,
      ArrowUp: -1,
    }
    const step = steps[event.key]
    if (step === undefined) return
    event.preventDefault()
    cycle(step)
    // Keep focus on the grid rather than the individual tile, so holding an
    // arrow key scrolls through options instead of walking the tab order.
    gridRef.current?.focus()
  }

  async function confirm() {
    if (saving) return
    setSaving(true)
    setError(null)
    try {
      await onConfirm(character)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save your character.')
      setSaving(false)
    }
  }

  return (
    <section className="pane p-5 sm:p-6">
      <h2 className="font-display text-3xl font-bold tracking-[-0.03em] text-stock-900">
        {initial ? 'Change your character' : 'Make yourself'}
      </h2>
      <p className="prose mt-2 max-w-[52ch] text-sm text-stock-600">
        This is you, everywhere in the game. Change anything you like — or press{' '}
        <span className="text-stock-900">Surprise me</span> until something looks right.
      </p>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
        {/* ---- the character, and the fastest way to change it ---- */}
        <div className="flex flex-col gap-3">
          <div className="pane-inset relative flex items-end justify-center px-4 pt-4 pb-2">
            <CharacterFigure character={character} height={330} />
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => cycle(-1)}
              className="btn btn-ghost btn-sm"
              aria-label={`Previous ${SLOT_LABELS[slot].toLowerCase()}`}
            >
              ←
            </button>
            <span className="label flex-1 text-center" aria-live="polite">
              {SLOT_LABELS[slot]} {index + 1} of {options.length}
            </span>
            <button
              type="button"
              onClick={() => cycle(1)}
              className="btn btn-ghost btn-sm"
              aria-label={`Next ${SLOT_LABELS[slot].toLowerCase()}`}
            >
              →
            </button>
          </div>
        </div>

        {/* ---- the catalogue ---- */}
        <div className="flex flex-col gap-3">
          <div role="tablist" aria-label="Body part" className="tabs">
            {SLOTS.map((candidate) => (
              <button
                key={candidate}
                type="button"
                role="tab"
                aria-selected={candidate === slot}
                tabIndex={candidate === slot ? 0 : -1}
                onClick={() => setSlot(candidate)}
                className="tab"
              >
                {SLOT_LABELS[candidate]}
              </button>
            ))}
          </div>

          <div
            ref={gridRef}
            role="radiogroup"
            aria-label={`${SLOT_LABELS[slot]} options`}
            tabIndex={0}
            onKeyDown={onGridKeyDown}
            className="grid grid-cols-4 gap-2 sm:grid-cols-5"
          >
            {options.map((part) => {
              const selected = part.id === character[slot]
              return (
                <button
                  key={part.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  aria-label={`${SLOT_LABELS[slot]} option ${part.id.split('-')[1]}`}
                  tabIndex={-1}
                  onClick={() => choose(part.id)}
                  data-selected={selected}
                  className="part-tile"
                >
                  <img src={partUrl(slot, part.id, 'thumb')} alt="" loading="lazy" draggable={false} />
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {error && (
        <p role="alert" className="mt-4 text-sm text-signal-600">
          {error}
        </p>
      )}

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => setCharacter(randomCharacter())} className="btn btn-ghost">
          Surprise me
        </button>
        <button type="button" onClick={() => void confirm()} disabled={saving} className="btn">
          {saving ? 'Saving…' : 'This is me'}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} disabled={saving} className="btn btn-ghost">
            Cancel
          </button>
        )}
        {replacesExistingPhoto && (
          <span className="text-xs text-stock-600">
            This replaces your current profile picture.
          </span>
        )}
      </div>
    </section>
  )
}
