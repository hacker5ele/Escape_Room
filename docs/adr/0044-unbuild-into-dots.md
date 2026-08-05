# ADR-0044: Screens unbuild themselves into dots

- **Status:** Accepted
- **Date:** 2026-08-05
- **Deciders:** Nepomuk Crhonek
- **Approved-by:** Nepomuk Crhonek, 2026-08-05
- **Amends:** [ADR-0038](0038-presence-and-the-iris-wipe.md)

## Context

Navigation was covered by an iris wipe: a circle closing over the screen, the route changing at full
ink, the circle opening again.

It worked and it was the wrong animation. An iris is period-correct for a 1950s cartoon and it is
*generic to every 1950s cartoon ever made* — it is the one transition anybody reaching for the
reference produces first. Nothing about it belonged to this app in particular, and a full-screen ink
disc also meant the outgoing screen contributed nothing: it was simply covered up.

There was a second problem underneath. The wipe was an overlay, so the pages on either side of it
never moved. Every screen in the app appeared fully formed, all at once, which is what a document
does. This is a game.

## Decision

**A screen comes apart into the dots it is printed with, and the next one is built out of them.**

Everything in this app is printed through a halftone: the page itself carries a 1px dot on a 6px
grid, and every generated character part and piece of scenery is screened by the same pipeline at a
5px pitch ([ADR-0032](0032-overprint-design-system.md), [ADR-0033](0033-modular-characters.md)). The
animation takes the page's own 6px grid, the one it is dissolving on top of. So a panel leaving does
not slide or fade. It loses ink
until only its dots are left, and those dots are the same size and pitch as the page's own — they
fade *into* the ground rather than off it. Arriving is the same sentence read backwards: a piece
enters as a screen, gains its ink on the way in, and lands.

This could not belong to a design system that was not already built out of dots, which is the entire
point of choosing it over the iris.

### The dissolve is a mask, not an opacity fade

```css
mask-image: radial-gradient(circle at center, #000 var(--dot-r), transparent calc(var(--dot-r) + 0.6px));
mask-size: 6px 6px;
```

`--dot-r` animates from `5px` — larger than the 4.25px half-diagonal of a 6px cell, so the dots
overlap completely and the element is not screened at all — down to `1px`, which is the page's own
dot exactly.

**The pitch never animates.** A screen whose pitch moves reads as the image scaling; only the dot
radius may change, or it stops being a dissolve.

`--dot-r` is registered with `@property` because an unregistered custom property does not
interpolate — it jumps at each keyframe. That is also the fallback on a browser without `@property`:
three visible steps instead of a dissolve, with the travel and the fade intact.

### What moves, and what deliberately does not

Panels — the outermost `.pane` of any nest — plus the controls a player actually aims at: room tiles,
emote keys, PLAY. **Not every `.btn`, and not list rows.** Thirty flying friend rows read as noise
rather than as motion, and on a phone they are a real frame-rate problem. Anything else opts in with
`data-piece` and out with `data-piece="no"`, which is how the stage arrives as one sheet instead of
scattering its scenery and its players individually.

A control inside a panel moves **as well as** its panel, not instead of it. The transforms compound,
so tiles drift within a panel as it arrives. That two-layer parallax is most of what sells it.

Direction, distance, spin and delay are redrawn per navigation, so no two arrivals are alike — and
distance is scaled to the viewport, because a fixed 400px throws a panel most of the way across a
phone and barely anywhere on a desktop.

### Going home gathers; going anywhere else is thrown

`/` uses short travel and an easing that settles without overshoot — the components coming back
together. Every other route is thrown from further out and lands with an overshoot. Two easings
because they are two different sentences.

### The dots belong to the unbuild, and only to it

**A screen coming apart dissolves into dots. A screen arriving flies in and lands, fully inked.**

Screening the arrival as well was symmetrical, obvious, and wrong to look at. **A 1px dot grid
destroys type long before it stops filling a rectangle** — a panel keeps reading as a pale box while
every word inside it has already gone. So each arriving panel appeared as a blank white rectangle
that only afterwards filled in, twenty of them staggered across a second. Shortening the screened
phase did not fix it, because the problem is not how long it lasts; it is that the arrival is
screened at all.

It is also not what was asked for. The request was that everything unbuilds itself, that only the
dots are left, and that the next screen *flies in*. Only the first half of that is a dissolve.

So an arriving piece has no mask on it, and its opacity is a **1ms switch rather than a fade** — it
exists only so a piece is not sitting visible at its scattered start while it waits out its stagger.
Two reasons it is not a real fade: "nothing fades in" is already a rule of this app's motion because
a linear fade is the tell that reads as machine-made, and an element below `opacity: 1` is its own
backdrop root, so a panel fading in is a panel with its glass switched off.

The dissolve and the travel are two animations sharing no property — one owns `--dot-r` and
`opacity`, the other `translate`, `rotate` and `scale`. Partly for independent timing, and partly
because a keyframe in the middle applies the easing to *each* interval it creates: an overshoot
written once would overshoot three times.

### A piece in flight loses its tint, but not its paper

**An element with a transform on it is its own stacking context, mask or no mask.** So for the length
of the animation a `.pane` has the one thing ADR-0032 says never to give it: `.pane::after` can no
longer reach the page to overprint against and blends against the panel instead. Unavoidable while a
thing is moving, so `--pane-ink: 0` for the duration rather than left to blend wrong. Losing a 5%
tint is very nearly nothing.

A *leaving* piece additionally drops its blur, because a mask makes the element its own backdrop root
and `.pane::before` has nothing left to blur. There is no glass worth preserving on something that is
turning into dots. An arriving piece has no mask, so it keeps it.

**`--pane-alpha` is deliberately not touched, and the first version of this rule got it wrong.**
Forcing it to `1` made the paper fill opaque, and under the panel's own top-edge white sheen that is
a flat white box.

### Each piece is cleaned up when it lands, not when the last one does

Same bug, second cause. On one shared timer the first panel kept its flattened look for the whole
stagger — most of a second after it had visibly settled — and then popped. An `animationend`
listener filtered to the travel animation corrects each piece on the frame it finishes, and there is
nothing left to see. The timer stays as a floor sweep, because `animationend` never fires for an
element that did not get to animate.

### Clipping, for about one second

A piece thrown in from off the right of a 375px phone widens the document and flashes a horizontal
scrollbar. `overflow-x: hidden` on `html` is the one thing ADR-0032 forbids outright, because it
silently kills `backdrop-filter` on every pane in the app.

So the container clips **only while something is in flight**, and only then. The pieces in flight
have had their blur turned off anyway, so during that second there is no backdrop-filter left to
lose.

## Consequences

**Good**

- The transition is made of the design system rather than applied on top of it.
- Both screens participate: one comes apart, the other builds. Nothing is merely covered up.
- No overlay element, no canvas, no `requestAnimationFrame` loop — the iris needed all three. This is
  transform, opacity and one mask, and touches no layout property, so it cannot reflow the page it is
  animating.
- A room can opt its own pieces in or out without knowing anything about the animation.

**Bad**

- **Navigation is deliberately delayed by 460ms** so the screen can come apart before the route
  changes. That is a real cost paid on every click, and it is the price of the change being unseen
  rather than merely quick.
- Masking ~20 elements at once is more per-frame work than fading an overlay. Bounded by keeping list
  rows out of the selection and by the sub-second duration.
- `@property` is required for the dissolve proper. Degrades to steps, does not break.

**Notable**

- `prefers-reduced-motion` is checked in JS and nothing is marked at all, so no element is left
  holding a transform. The CSS rule beside it is for a preference changed mid-flight.
- The guard against re-entering `travel()` is not theoretical. Twice in this app an effect depended on
  something rebuilt every render and a transition played six times for one click
  ([ADR-0041](0041-stable-callbacks-in-effects.md)). A test asserts a re-render does not re-scatter, and it fails
  against an effect with unstable dependencies.

## Alternatives considered

**Keeping the iris and animating the pages under it.** Half the work for most of the effect — and it
keeps the part that was wrong. The iris was never the weak half.

**The View Transitions API.** Genuinely the right tool for cross-route animation, and it would have
done the crossfade and the shared-element work for free. Firefox did not ship it until well after
this project's browsers were decided, the per-element choreography here is the interesting part
rather than the crossfade, and a `::view-transition` snapshot of a `.pane` loses its
`backdrop-filter` anyway — so the flattening problem above would still need solving, with less
control over when.

**Canvas particles — actual dots flying apart.** The literal reading of the request, and it would
look better in a screenshot. It also means rasterising every panel to a texture on each navigation,
a physics loop, and a second rendering path for text that the DOM already draws perfectly. The mask
gets the same idea with no second renderer.

**Animating every element on the page.** Rejected in favour of panels-and-controls after weighing the
three at roughly 6, 20 and 50+ moving pieces. At 50+ a long activity log becomes fifty flying
objects, the eye cannot follow it, and it reads as breakage rather than motion.
