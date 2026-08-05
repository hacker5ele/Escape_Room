import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CharacterFigure } from './CharacterFigure'
import { CharacterPicker } from './CharacterPicker'
import { RIG, SLOTS, isCharacter, partsIn, randomCharacter, type Slot } from './parts'

describe('the catalogue', () => {
  it('has twenty of every part', () => {
    // This is the check that catches a generation run which quietly gave up.
    // Roughly one call in four comes back HTTP 520, and a manifest with
    // seventeen legs in it would otherwise reach production looking fine.
    for (const slot of SLOTS) {
      expect(partsIn(slot as Slot), `slot "${slot}"`).toHaveLength(20)
    }
  })

  it('gives every part a pivot inside its own bounds', () => {
    for (const slot of SLOTS) {
      for (const part of partsIn(slot as Slot)) {
        expect(part.pivot[0], `${part.id} pivot x`).toBeGreaterThanOrEqual(0)
        expect(part.pivot[0], `${part.id} pivot x`).toBeLessThanOrEqual(part.w)
        expect(part.pivot[1], `${part.id} pivot y`).toBeGreaterThanOrEqual(0)
        expect(part.pivot[1], `${part.id} pivot y`).toBeLessThanOrEqual(part.h)
      }
    }
  })

  it('hangs a head from its neck and a limb from its top', () => {
    // Get this backwards and a head swings like a pendulum instead of turning.
    for (const part of partsIn('head')) {
      expect(part.pivot[1], `${part.id}`).toBe(part.h)
    }
    for (const slot of ['arm', 'leg'] as const) {
      for (const part of partsIn(slot)) {
        expect(part.pivot[1], `${part.id}`).toBe(0)
      }
    }
  })
})

describe('the rig', () => {
  it('hangs the head lower than the torso, so the two overlap', () => {
    // Level with each other, the head's flat bottom stops exactly where the
    // vest's shoulder line starts — and the vest has an open neck hole, so the
    // page shows through the gap and the head reads as detached.
    expect(RIG.chin[1]).toBeGreaterThan(RIG.neck[1])
  })

  it('keeps the whole figure inside the frame', () => {
    const tallest = (slot: Slot) => Math.max(...partsIn(slot).map((part) => part.h))

    // A head hangs upward from the chin; a leg hangs down from the hip.
    expect(RIG.chin[1] - tallest('head')).toBeGreaterThanOrEqual(0)
    expect(RIG.hipL[1] + tallest('leg')).toBeLessThanOrEqual(690)
  })
})

describe('a random character', () => {
  it('is always one the app will accept', () => {
    for (let attempt = 0; attempt < 40; attempt += 1) {
      expect(isCharacter(randomCharacter())).toBe(true)
    }
  })

  it('does not always produce the same person', () => {
    const seen = new Set(Array.from({ length: 30 }, () => JSON.stringify(randomCharacter())))
    expect(seen.size).toBeGreaterThan(1)
  })
})

describe('validating what came back from storage', () => {
  it('rejects anything that is not a complete, known character', () => {
    const valid = randomCharacter()
    expect(isCharacter(valid)).toBe(true)

    expect(isCharacter(null)).toBe(false)
    expect(isCharacter('head-01')).toBe(false)
    expect(isCharacter({ ...valid, head: undefined })).toBe(false)
    // The id shape is right but no such part exists — exactly what a stale
    // value in client-writable metadata looks like after the catalogue changes.
    expect(isCharacter({ ...valid, leg: 'leg-99' })).toBe(false)
  })
})

describe('the figure', () => {
  it('draws six layers — two legs and two arms from one drawing each', () => {
    const { container } = render(<CharacterFigure character={randomCharacter()} />)
    expect(container.querySelectorAll('[data-part]')).toHaveLength(6)
    expect(container.querySelectorAll('[data-mirror]')).toHaveLength(2)
  })

  it('can be rendered still, for places that should not animate', () => {
    const { container } = render(
      <CharacterFigure character={randomCharacter()} animated={false} />,
    )
    expect(container.querySelector('.character-live')).toBeNull()
  })
})

describe('choosing a character', () => {
  const noop = () => Promise.resolve()

  it('shows twenty options for the open slot', async () => {
    render(<CharacterPicker onConfirm={noop} />)
    expect(screen.getAllByRole('radio')).toHaveLength(20)
  })

  it('switches catalogue when you switch slot', async () => {
    render(<CharacterPicker onConfirm={noop} />)
    expect(screen.getByRole('tab', { name: 'Head' })).toHaveAttribute('aria-selected', 'true')

    await userEvent.click(screen.getByRole('tab', { name: 'Legs' }))

    expect(screen.getByRole('tab', { name: 'Legs' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByText(/legs 1?\d+ of 20/i)).toBeInTheDocument()
  })

  it('cycles the open slot with the arrow keys', async () => {
    render(<CharacterPicker onConfirm={noop} />)
    const before = screen.getAllByRole('radio').findIndex((r) => r.getAttribute('aria-checked') === 'true')

    screen.getByRole('radiogroup').focus()
    await userEvent.keyboard('{ArrowRight}')

    const after = screen.getAllByRole('radio').findIndex((r) => r.getAttribute('aria-checked') === 'true')
    expect(after).toBe((before + 1) % 20)
  })

  it('wraps round rather than stopping at the end', async () => {
    render(<CharacterPicker onConfirm={noop} />)
    const group = screen.getByRole('radiogroup')
    group.focus()

    // Twenty steps from anywhere lands back where it started.
    const start = screen.getAllByRole('radio').findIndex((r) => r.getAttribute('aria-checked') === 'true')
    for (let step = 0; step < 20; step += 1) await userEvent.keyboard('{ArrowRight}')
    const end = screen.getAllByRole('radio').findIndex((r) => r.getAttribute('aria-checked') === 'true')

    expect(end).toBe(start)
  })

  it('hands back a complete character when you confirm', async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined)
    render(<CharacterPicker onConfirm={onConfirm} />)

    await userEvent.click(screen.getByRole('button', { name: /this is me/i }))

    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect(isCharacter(onConfirm.mock.calls[0]?.[0])).toBe(true)
  })

  it('opens on who you already are when reopened to edit', () => {
    const mine = randomCharacter()
    render(<CharacterPicker onConfirm={noop} initial={mine} onCancel={() => undefined} />)

    expect(screen.getByRole('heading', { name: /change your character/i })).toBeInTheDocument()

    // The head grid is open, so the checked tile must be the head you had.
    const checked = screen
      .getAllByRole('radio')
      .findIndex((tile) => tile.getAttribute('aria-checked') === 'true')
    expect(partsIn('head')[checked]?.id).toBe(mine.head)
  })

  it('offers a way out only when there is something to go back to', async () => {
    const onCancel = vi.fn()
    const { rerender } = render(<CharacterPicker onConfirm={noop} />)
    // At sign-up there is no game behind the picker, so cancelling would leave
    // the player nowhere.
    expect(screen.queryByRole('button', { name: /cancel/i })).not.toBeInTheDocument()

    rerender(
      <CharacterPicker onConfirm={noop} initial={randomCharacter()} onCancel={onCancel} />,
    )
    await userEvent.click(screen.getByRole('button', { name: /cancel/i }))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('warns before it overwrites a picture you already had', () => {
    const { rerender } = render(<CharacterPicker onConfirm={noop} />)
    expect(screen.queryByText(/replaces your current profile picture/i)).not.toBeInTheDocument()

    rerender(<CharacterPicker onConfirm={noop} replacesExistingPhoto />)
    expect(screen.getByText(/replaces your current profile picture/i)).toBeInTheDocument()
  })
})
