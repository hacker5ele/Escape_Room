# ADR-0041: An effect may not depend on a callback prop

- **Status:** Accepted
- **Date:** 2026-08-05
- **Deciders:** Nepomuk Crhonek
- **Approved-by:** Nepomuk Crhonek, 2026-08-05

## Context

The same bug has now shipped three times, in three different components, and been reported by a
player each time.

A callback prop written inline at the call site — `onDone={() => navigate('/lobby')}` — is a **new
function on every render**. An effect that lists it as a dependency is therefore torn down and set up
again on every render of the parent. For a short effect that is a small waste. For a long-lived one
it is total breakage:

| what broke | how it looked |
| --- | --- |
| **The 3·2·1 countdown.** Its interval was recreated ~60 times a second and never survived to its first 700 ms tick. | It never counted. Not slow — it never advanced once. |
| **The iris wipe.** Covering a navigation guarantees the parent re-renders, which restarted the animation. | *"the transition animation still playing a few times!!"* — measured at six. |
| **Follow-the-host in the lobby and the room.** The effect rebuilt on every render while the phase stayed `room`. | Navigation fired repeatedly. |

They share one cause, and the lobby re-renders about sixty times a second while anybody is walking,
which is what turns a latent version of this into a visible one.

**`react-hooks/exhaustive-deps` does not catch it.** The lint rule enforces that dependencies are
*complete*; it has nothing to say about one that changes identity every render. The code was
correct by the linter's standard and broken in the browser.

## Decision

**A callback prop used inside an effect is wrapped in `useEvent()` first.**

`apps/frontend/src/ui/useEvent.ts` returns a function whose identity never changes but which always
calls the latest one it was given. The effect then lists the wrapper, and runs once.

```ts
const done = useEvent(onDone)          // identity is stable for the component's life
useEffect(() => { … }, [done])         // so this runs once
```

Applied to every instance: `IrisWipe`, `Countdown`, `LobbyView` and `RoomView`.

The ref is updated in a **layout effect** rather than during render, because a render can be thrown
away and restarted under concurrent rendering, and a ref written during one would then hold a
callback from a render that never happened.

This is the `useEffectEvent` pattern from the React documentation, which is still experimental in
React itself. Fifteen lines is cheaper than waiting for it, and cheaper than a fourth occurrence.

### The test asserts the count, not the behaviour

`IrisWipe.test.tsx` renders the wipe under a parent that re-renders on demand and asserts the
callbacks fire **exactly once**. Verified by reintroducing the original dependency array: the wipe
then fires **six** times, which is what was reported.

That is the shape the other two needed and did not have. A test that only asks "did it eventually
finish?" passes against all three bugs.

## Consequences

**Good**

- The class is closed rather than three instances patched.
- The failure mode is now a test failure with a count in it, not a player noticing a flicker.
- `Countdown` loses the bespoke ref it grew before the helper existed.

**Bad**

- One more thing to know when writing a component that takes callbacks. It is not enforced by
  tooling, so it relies on the rule being known — which is why it is in CLAUDE.md as well as here.
- `useEvent` is deliberately not for render-time use. A stable identity that reads mutable state is
  wrong to call while rendering, and nothing prevents it.

**Notable**

- The lobby re-rendering sixty times a second is what made all three visible. That was itself a bug —
  `usePresence` called `setActors` every frame even with nobody else on the stage — and is fixed. The
  effects would still have been wrong without it, just less obviously.

## Alternatives considered

**`useCallback` at each call site.** Works, and puts the burden on every caller to remember, in a
file that has no idea the callee uses an effect. The three bugs are what that policy produces.

**Empty dependency arrays with an eslint-disable.** Silences the linter and captures the first
render's closure for ever — a different bug, and a quieter one.

**A lint rule of our own** forbidding callback props in dependency arrays. The genuinely thorough
answer. Not on day three of five, and `useEvent` makes the correct thing the easy thing anyway.
