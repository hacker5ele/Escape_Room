import { existsSync, readFileSync } from 'node:fs'
import { useState } from 'react'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Assemble, pieces, unbuild } from './Assemble'

/**
 * The design system, as text.
 *
 * Off disk rather than imported. `../index.css?raw` looks like the obvious way
 * and silently returns an **empty string** — the Tailwind plugin claims every
 * CSS import — which made the two assertions below pass against a stylesheet
 * that had exactly what they forbid in it. A guard that cannot fail is worse
 * than no guard, so this one proves it found the file first.
 *
 * Two candidates because `process.cwd()` is the workspace under `npm test` and
 * the repository root under `vitest --root`.
 */
function designSystem(): string {
  const path = ['src/index.css', 'apps/frontend/src/index.css'].find(existsSync)
  expect(path, 'could not find index.css to check it').toBeDefined()
  return readFileSync(path as string, 'utf8')
}

/** Detached on purpose: `pieces()` reads a tree, and a stray one in the
 *  document would show up in every later `screen` query. */
function markup(html: string): HTMLElement {
  const root = document.createElement('div')
  root.innerHTML = html
  return root
}

/** jsdom implements no animations and so has no `AnimationEvent` to construct. */
function animationEnd(animationName: string): Event {
  const event = new Event('animationend', { bubbles: true })
  Object.defineProperty(event, 'animationName', { value: animationName })
  return event
}

describe('a piece in flight is the same panel, moved', () => {
  // Read rather than rendered: jsdom applies no CSS, so the only way to hold
  // this rule is to assert on the stylesheet itself. Comments are stripped
  // first — index.css explains at length why these declarations are absent, and
  // the explanation must not read as the thing it is warning about.
  const css = designSystem()
  const start = css.indexOf('@property --dot-r')
  const transition = css.slice(start).replace(/\/\*[\s\S]*?\*\//g, '')

  it('is looking at the block it thinks it is', () => {
    expect(start).toBeGreaterThan(0)
    expect(transition).toContain('.piece-arriving')
    expect(transition).toContain('.piece-leaving')
  })

  it("takes away a moving panel's fill, which is what makes it match", () => {
    // `.pane::before` and `::after` sit at `z-index: -1` under an element that
    // is not a stacking context, so they paint before `body` — whose opaque
    // background covers them. They have never been seen in this app. Any
    // transform makes `.pane` a stacking context, traps them, and they finally
    // appear: measured in Chrome, a pane's interior goes from being the bare
    // page (texture 29.1) to a flat, bluer block (texture 3.3). That is the
    // white background, and taking the fill away for the length of the move
    // brings it back to within one part in 200 of the resting panel.
    const rule = transition.match(/([^{}]+)\{\s*display:\s*none;?\s*\}/)
    expect(rule, 'no rule hides the fill of a moving panel').not.toBeNull()

    for (const selector of [
      '.piece-arriving.pane::before',
      '.piece-arriving.pane::after',
      '.piece-arriving .pane::before',
      '.piece-arriving .pane::after',
      '.piece-leaving.pane::before',
      '.piece-leaving.pane::after',
      // Descendants matter too: a room's `.pane` sits inside the stage, and the
      // stage is one piece.
      '.piece-leaving .pane::before',
      '.piece-leaving .pane::after',
    ]) {
      expect(rule?.[1]).toContain(selector)
    }
  })

  it('changes no pane token', () => {
    // Three separate attempts to "compensate" for the stacking context a
    // transform creates — `--pane-alpha: 1`, then `--pane-ink: 0`, then
    // `--pane-blur: 0` — each produced the same report: panels fly in pale and
    // correct themselves on landing. A panel is coloured by exactly one set of
    // rules, and moving it is not one of them.
    expect(transition).not.toMatch(/--pane-(blur|alpha|ink)\s*:/)
  })

  it('never clips the container, in either axis', () => {
    // `overflow` other than `visible` above a `.pane` silently disables its
    // `backdrop-filter` — the first rule at the top of index.css. Doing it
    // "only while animating" is not a mitigation: it flattens every panel on
    // the page for the length of the animation. `inward()` keeps pieces on
    // screen instead, so there is nothing to clip.
    expect(transition).not.toMatch(/\boverflow(-[xy])?\s*:/)
  })
})

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

  it('clears each piece as it lands, not when the last one does', () => {
    // A piece in flight has a transform, so it is its own stacking context and
    // its `.pane` layers cannot blend against the page. On one shared timer the
    // first panel kept that flattened look for the whole stagger — most of a
    // second after it had visibly settled — and then popped back.
    render(<Screen />)
    const panel = screen.getByTestId('panel')

    act(() => {
      panel.dispatchEvent(animationEnd('piece-land'))
    })

    expect(panel).not.toHaveClass('piece-arriving')
  })

  it('ignores the end of the opacity switch, which is not the landing', () => {
    // `piece-appear` is the 1ms opacity switch; `piece-land` is the 560ms flight.
    // Clearing on the first would snap every piece home before it had moved.
    render(<Screen />)
    const panel = screen.getByTestId('panel')

    act(() => {
      panel.dispatchEvent(animationEnd('piece-appear'))
    })

    expect(panel).toHaveClass('piece-arriving')
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
