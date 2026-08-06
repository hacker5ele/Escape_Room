# ADR-0035: Everything is responsive, from 320px up

- **Status:** Accepted
- **Date:** 2026-08-05
- **Deciders:** Nepomuk Crhonek
- **Approved-by:** Nepomuk Crhonek, 2026-08-05

## Context

The app was built on laptops and only ever looked at on laptops. It was not unresponsive by
decision — the social panels are careful, with `min-w-0`, `truncate` and `break-words` in the right
places — but nothing had been checked at a phone's width, and several things were broken there:

- The masthead was a fixed 48px in a wide display face. *"Der digitale Escape Room"* ran off a 320px
  screen.
- The tab strip wrapped to a second line. Each tab sets `border-bottom: 0` because the strip draws
  the line, so a wrapped row lost its border entirely and read as broken rather than as more tabs.
- The notification dropdown was a fixed 20rem anchored to the bell on the right, so on a small phone
  it ran off the left edge.
- The chat window was a fixed 24rem tall — taller than a phone held sideways, which is exactly when
  two people are typing at each other.
- Buttons came out around 32px tall, below the ~44px a finger hits reliably.
- Form fields were 0.85rem. **iOS Safari zooms the page when a field under 16px takes focus, and does
  not zoom back out**, so the first tap on the sign-up form left the layout broken for the rest of
  the session.
- The character picker only went side-by-side at `lg`, so on a tablet the figure pushed the catalogue
  below the fold and you chose parts without seeing what they did.

On Thursday the other team tries to break this app, and on Friday it is demonstrated. Somebody will
open it on a phone.

## Decision

**Every screen works from 320px up, and "works" means usable rather than merely not broken.** This is
rule 8 in CLAUDE.md: a condition of the work being finished, not a pass somebody makes afterwards.

Concretely, and these are the parts worth knowing before building a room:

**Type is fluid, not stepped.** The masthead is `clamp(2rem, 8.5vw, 3.75rem)` rather than two fixed
sizes at a breakpoint. A display face at a fixed size either overflows the small end or is timid at
the large one.

**Anything that cannot shrink, scrolls.** The tab strip is `flex-wrap: nowrap` with `overflow-x:
auto` and a hidden scrollbar. Wrapping was the bug; scrolling is also what a phone user expects of a
tab strip.

**Overlays are measured against the viewport, not the design.** The notification dropdown is
`w-[min(20rem,calc(100vw-2.5rem))]`. Anything absolutely positioned needs this treatment.

**Heights that could exceed the screen use `svh`.** The chat window is `h-[min(24rem,70svh)]` —
`svh` rather than `vh` because mobile browsers change the viewport height as the address bar moves,
and `vh` is measured against the larger one.

**Controls have floors: `min-height: 2.75rem` on `.btn` and `.field`, 2.25rem on `.btn-sm`.** And
`.field` sets `font-size: max(1rem, …)` — the iOS zoom trap above is a genuine layout break, not a
nicety.

**Nothing measures its own container in order to size itself.** This is the trap that cost the most
time here. The character figure is laid out from the rig in pixels, so the obvious approach is a
`ResizeObserver` on its stage feeding a pixel height — and that fed a loop: changing slot changed the
page height, which toggled the vertical scrollbar, which changed the width, which resized the figure,
which changed the page height again. It read as the whole window flinching on every click.

The fix was to remove the measurement rather than damp it. Every layer is now positioned as a
**percentage of the frame**, with the container carrying an `aspect-ratio` — so the figure fills
whatever width it is given, in pure CSS, and the scrollbar can come and go without anything reacting
to it. If a component seems to need its own size in JavaScript, that is usually a sign the geometry
can be expressed proportionally instead.

### The one thing that must not be done

**`overflow-x: hidden` on `html` or `body` is forbidden**, however tempting as a way to stop
sideways scrolling. `overflow` other than `visible` on an ancestor of a `.pane` disables its
`backdrop-filter` — that is the first rule of ADR-0032, and `html` is an ancestor of every pane in
the app. The design would go flat everywhere and nothing would report an error.

So the rule is the harder one: nothing is allowed to overflow in the first place, and anything
genuinely wider than the screen carries its own scroller.

## Consequences

**Good**

- The app is usable on the device it is most likely to be opened on.
- The traps are written down, which matters more than the fixes: the iOS zoom and the
  `overflow-x`/`backdrop-filter` interaction are both invisible until they are not.
- Touch targets and fluid type are set at the token layer, so a new room gets them by using `.btn`
  and `.field` rather than by remembering.

**Bad**

- `min-height` on buttons makes dense rows taller on desktop, where it buys nothing.
- Fluid `clamp()` is harder to reason about than a breakpoint, and cannot be seen in a single
  viewport.
- **None of this is enforced by a test.** The suite runs in jsdom, which has no layout at all — it
  cannot tell whether something overflows. This is a rule people follow, checked by opening the app
  narrow, and it will decay unless somebody keeps doing that.

**Notable**

- jsdom implements neither `matchMedia` nor `ResizeObserver`, so both are stubbed in the frontend
  test setup. Anything new that reacts to the size or shape of the viewport will need the same, and
  the failure is a `ReferenceError` on mount rather than something that looks like a layout problem.
  The `ResizeObserver` stub is kept even though nothing observes any more — the next component that
  reaches for one should fail on its own merits, not on a missing global.

## Alternatives considered

**A separate mobile layout.** Two layouts to keep in step, in a five-day build, with four rooms still
to write. Rejected immediately.

**`overflow-x: hidden` on the root.** One line, stops horizontal scrolling everywhere, and silently
disables the design system. Rejected — and written down here because it is the obvious thing to reach
for and the damage is invisible.

**Testing this with Playwright at several viewports.** The right answer, and genuinely the only way
to stop it decaying. Not this week; noted as the thing to add when there is time.
