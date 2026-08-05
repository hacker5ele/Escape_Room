import { useState } from 'react'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Assemble, pieces, unbuild } from './Assemble'

/** Detached on purpose: `pieces()` reads a tree, and a stray one in the
 *  document would show up in every later `screen` query. */
function markup(html: string): HTMLElement {
  const root = document.createElement('div')
  root.innerHTML = html
  return root
}

describe('choosing what moves', () => {
  it('takes the outermost panel of a nest, not both', () => {
    const root = markup(`
      <section class="pane" id="outer">
        <div class="pane" id="inner">nested</div>
      </section>
    `)

    expect(pieces(root).map((node) => node.id)).toEqual(['outer'])
  })

  it('takes the controls a player aims at, and leaves list rows alone', () => {
    // The lobby, in miniature. Room tiles and PLAY move; the friend row's own
    // button does not — thirty flying rows read as noise rather than as motion,
    // which is the whole reason `.btn` is not in the selector.
    const root = markup(`
      <section class="pane" id="panel">
        <button class="room-tile" id="tile"></button>
        <button class="emote-key" id="emote"></button>
        <button class="btn play-button" id="play"></button>
        <ul><li><button class="btn" id="row-action"></button></li></ul>
      </section>
    `)

    const ids = pieces(root).map((node) => node.id)
    expect(ids).toContain('tile')
    expect(ids).toContain('emote')
    expect(ids).toContain('play')
    expect(ids).not.toContain('row-action')
  })

  it('returns them in document order, because that order becomes the stagger', () => {
    const root = markup(`
      <section class="pane" id="first"></section>
      <section class="pane" id="second"></section>
      <section class="pane" id="third"></section>
    `)

    expect(pieces(root).map((node) => node.id)).toEqual(['first', 'second', 'third'])
  })

  it('honours data-piece in both directions, including for a whole subtree', () => {
    const root = markup(`
      <div data-piece id="stage">
        <div class="pane" id="inside-stage"></div>
      </div>
      <section class="pane" id="opted-out" data-piece="no">
        <button class="room-tile" id="child-of-opted-out"></button>
      </section>
    `)

    const ids = pieces(root).map((node) => node.id)
    expect(ids).toContain('stage')
    expect(ids).not.toContain('opted-out')
    // The point of the subtree rule: a room that opts its stage out does not
    // then have to opt every control inside it out one by one.
    expect(ids).not.toContain('child-of-opted-out')
  })

  it('falls back to direct children when a screen has no panels or controls', () => {
    const root = markup(`<div id="only-child">a full-bleed screen</div>`)
    expect(pieces(root).map((node) => node.id)).toEqual(['only-child'])
  })
})

describe('arriving', () => {
  beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }))
  afterEach(() => vi.useRealTimers())

  function Screen() {
    const [count, setCount] = useState(0)
    return (
      <MemoryRouter>
        <Assemble>
          <section className="pane" data-testid="panel">
            <button type="button" onClick={() => setCount((n) => n + 1)}>
              re-render {count}
            </button>
          </section>
        </Assemble>
      </MemoryRouter>
    )
  }

  it('marks each piece with its own direction and delay', () => {
    render(<Screen />)
    const panel = screen.getByTestId('panel')

    expect(panel).toHaveClass('piece-arriving')
    expect(panel.style.getPropertyValue('--fly-x')).toMatch(/px$/)
    expect(panel.style.getPropertyValue('--fly-delay')).toMatch(/ms$/)
  })

  it('clears the transform once it has landed', () => {
    render(<Screen />)
    const panel = screen.getByTestId('panel')

    act(() => void vi.advanceTimersByTime(2000))

    // Left in place, a transform on a panel fights whatever animates it next —
    // the character rig is transform-driven end to end.
    expect(panel).not.toHaveClass('piece-arriving')
    expect(panel.style.getPropertyValue('--fly-x')).toBe('')
  })

  it('does not re-scatter on a re-render', async () => {
    // The regression this exists for. Twice now an effect in this app depended
    // on something rebuilt every render, and the transition played six times
    // for one navigation. Here that would show up as a panel being thrown from
    // a fresh direction every time any state above it changed.
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(<Screen />)
    const panel = screen.getByTestId('panel')
    const first = panel.style.getPropertyValue('--fly-x')

    await user.click(screen.getByRole('button'))
    await user.click(screen.getByRole('button'))

    expect(panel.style.getPropertyValue('--fly-x')).toBe(first)
  })
})

describe('leaving', () => {
  it('takes the mounted screen apart', () => {
    render(
      <MemoryRouter>
        <Assemble>
          <section className="pane" data-testid="panel" />
        </Assemble>
      </MemoryRouter>,
    )

    act(() => unbuild())

    expect(screen.getByTestId('panel')).toHaveClass('piece-leaving')
  })

  it('does nothing at all when nothing is mounted', () => {
    // Called from `travel()`, which a route can reach before or after the
    // container exists. Throwing here would break navigation itself.
    expect(() => unbuild()).not.toThrow()
  })
})
