import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { render, act } from '@testing-library/react'
import { IrisWipe } from './IrisWipe'
import { useEvent } from '../ui/useEvent'

/**
 * The transition must play exactly once.
 *
 * It did not: `onCovered` and `onDone` are written inline at the call site, so
 * they were a new function on every render, and the effect listed them as
 * dependencies. Covering a navigation guarantees the parent re-renders — so the
 * wipe tore itself down and started again, several times per journey.
 *
 * jsdom has no canvas, so `getContext('2d')` returns null and the component
 * takes its "cannot draw" path: both callbacks fire immediately. That is
 * exactly what makes the *count* observable here.
 */
describe('the iris wipe', () => {
  it('runs once, however often the parent re-renders', () => {
    const covered = vi.fn()
    const done = vi.fn()

    function Parent() {
      const [, force] = useState(0)
      // Inline arrows, exactly as the app writes them — this is the shape that
      // used to restart the animation.
      return (
        <>
          <button type="button" onClick={() => force((n) => n + 1)}>
            re-render
          </button>
          <IrisWipe onCovered={() => covered()} onDone={() => done()} />
        </>
      )
    }

    const { getByRole } = render(<Parent />)

    expect(covered).toHaveBeenCalledTimes(1)
    expect(done).toHaveBeenCalledTimes(1)

    // Five parent re-renders must not restart it.
    for (let i = 0; i < 5; i += 1) {
      act(() => getByRole('button').click())
    }

    expect(covered).toHaveBeenCalledTimes(1)
    expect(done).toHaveBeenCalledTimes(1)
  })
})

describe('a stable callback', () => {
  it('keeps one identity but calls the newest function', () => {
    const seen: string[] = []
    let stable: (() => void) | null = null

    function Probe({ label }: { label: string }) {
      const call = useEvent(() => seen.push(label))
      // The identity must never change, or an effect depending on it restarts.
      if (stable === null) stable = call
      expect(call).toBe(stable)
      return null
    }

    const { rerender } = render(<Probe label="first" />)
    stable!()

    rerender(<Probe label="second" />)
    stable!()

    // Same function object throughout, but the latest closure each time.
    expect(seen).toEqual(['first', 'second'])
  })
})
