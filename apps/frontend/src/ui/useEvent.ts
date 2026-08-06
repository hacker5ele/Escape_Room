import { useCallback, useLayoutEffect, useRef } from 'react'

/**
 * A callback whose identity never changes, but which always calls the latest one.
 *
 * This exists because of a specific bug that has now happened three times.
 *
 * A callback prop written inline at the call site — `onDone={() => …}` — is a
 * **new function on every render**. An effect that lists it as a dependency is
 * therefore torn down and set up again on every render of the parent. For a
 * long-lived effect that is not a small inefficiency, it is total breakage:
 *
 *   - the 3·2·1 countdown recreated its interval ~60 times a second and could
 *     never reach its first 700 ms tick, so it never counted at all;
 *   - the iris wipe restarted its animation every time the parent re-rendered,
 *     which the navigation it was covering guaranteed — so the transition
 *     played several times per journey.
 *
 * Wrapping the prop here makes the effect's dependency stable, so it runs once
 * and still calls whatever the parent passed most recently.
 *
 * The ref is updated in a layout effect rather than during render, because a
 * render can be thrown away and restarted under concurrent rendering — and a
 * ref written during one would then hold a callback from a render that never
 * happened.
 *
 * This is the `useEffectEvent` pattern from the React docs, which is still
 * experimental in React itself; ~15 lines here is cheaper than waiting for it.
 */
export function useEvent<Args extends unknown[], Result>(
  callback: (...args: Args) => Result,
): (...args: Args) => Result {
  const latest = useRef(callback)

  useLayoutEffect(() => {
    latest.current = callback
  })

  return useCallback((...args: Args) => latest.current(...args), [])
}
