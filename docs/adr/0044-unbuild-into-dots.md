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

### A moving panel hides its own fill, because a resting one already does

Panels flew in white. Four attempts to fix it failed because all four were guesses about a mechanism
none of them had measured:

| attempt | why it did nothing |
| --- | --- |
| `--pane-alpha: 1` | made it *worse* — an opaque fill under the panel's top-edge sheen |
| `--pane-ink: 0` | the tint was never the difference |
| `--pane-blur: 0` | `blur(0px)` is still a `backdrop-filter`, so it changes nothing |
| `overflow-x: clip` while animating | flattened every panel on the page, landed or not — the first rule at the top of `index.css`, and "only while animating" is not a mitigation for it |

Rendering it in headless Chrome and measuring the pixels found the actual cause in one pass.

**`.pane::before` and `.pane::after` are invisible.** Not subtle — they never reach the screen. They
sit at `z-index: -1`, and because `.pane` is not a stacking context they paint in the *root* stacking
context's negative layer, which comes **before** `body` — an in-flow block whose background is
opaque. The page is drawn straight over them.

Painting a pane's fill bright red proves it: the panel looks completely ordinary. Give that same
panel any transform and it turns scarlet, because the transform makes `.pane` a stacking context and
the fill is trapped inside it, where it finally paints on top.

| specimen | mean RGB | halftone contrast | vs rest |
| --- | --- | --- | --- |
| bare page, no panel | (234.1, 228.0, 211.2) | 29.0 | |
| **panel at rest** | (233.8, 227.8, 211.0) | 29.1 | 0.0 |
| panel with a transform | (232.6, 229.7, 217.7) | **3.3** | **9.8** |
| transform, fill hidden | (233.6, 227.5, 210.8) | 29.1 | **0.7** |

A panel at rest is the bare page to within a rounding error. Under a transform it is a flat, bluer
block with no page texture in it at all — that is the white. `backdrop-filter` is not involved:
forcing it to `none` changes nothing, and neither does moving the transform to a wrapper.

So **the fill is taken away for exactly as long as a piece is moving**, which leaves the panel
showing the page through it — which is what it does standing still. The two states match to about one
part in 200.

The stacking context itself is unavoidable while something moves, so it is held as briefly as
possible: each piece is cleared on its own `animationend` rather than on a timer waiting for the
slowest. And instead of clipping, `inward()` turns around any piece that would start off the right or
the bottom of the page — coming from the left or the top costs nothing, because content outside those
edges is not scrollable to. The distance is never shortened, only mirrored.

**This makes the animation correct. It does not make the design system correct** — see the open
question below.

**Three tests read `index.css`** and fail if the fill rule goes away, if any `--pane-*` token
reappears, or if an `overflow` lands on the container. They assert they found the block first,
because the version that imported the stylesheet with `?raw` got an **empty string** back — the
Tailwind plugin claims every CSS import — and passed against a stylesheet containing precisely what
it forbade.

## Open question, for a person to decide

**The Overprint glass has never once been seen in this app.** The paper fill, the top-edge sheen and
the overprint tint are all on those two buried pseudo-elements, and the page has been painting over
all three since ADR-0032 shipped. Every panel anybody has looked at is border, shadow and text over
the bare page.

Fixing it is a one-line change — `isolation: isolate` on `.pane`, or lifting the pseudo-elements out
of negative z-index — and it would change how **every screen in the app looks**, which makes it a
design decision rather than a bug fix. It is not taken here. This ADR only makes a moving panel look
like a resting one; what a resting one *should* look like is Nepomuk's call.

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
