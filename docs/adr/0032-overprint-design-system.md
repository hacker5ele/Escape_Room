# ADR-0032: Overprint — a design system built on two spot inks

- **Status:** Accepted
- **Date:** 2026-08-05
- **Deciders:** Nepomuk Crhonek
- **Approved-by:** Nepomuk Crhonek, 2026-08-05

## Context

The app had no design. Not an unfinished one — none at all.

Tailwind v4 was installed and wired into Vite, but `index.css` never imported it, so not a single
utility class was ever generated. Every component was written against colour names — `vault-900`,
`signal-400`, `solved-400` — that existed nowhere. The stylesheet actually shipping to browsers was
1.7 KB of leftover Vite starter theme whose accent colour was `#aa3bff`, a purple nobody chose.

So roughly two hundred `className` attributes across eleven components were decorative text. The app
rendered as unstyled HTML on a white page, and had done since the scaffold.

Two requirements were given: the look is **glassmorphism**, and it must **not look AI-generated**.

The second one is a real constraint, not a mood. Generated design clusters hard, and the tells are
specific and well documented: purple-to-blue gradients, Inter, a uniform 16px border radius and 24px
padding on everything, equal-sized cards in a row, hover states that do nothing, buttons that snap
instead of easing. A first pass at this offered four directions — and all four turned out to be the
same design: near-black ground, one saturated accent, a rounded translucent card floating on a
gradient. That *is* the cluster. Changing the accent hue does not leave it.

The third constraint is Thursday, when the other team tries to break the app. A design system that
falls apart under a browser without `backdrop-filter`, or that fails contrast over its own
background, is a defect they will find.

## Decision

We build **Overprint**: a screenprint, not a screen.

Two spot inks — a warm red and a process cyan — laid over paper stock, going dark where they cross.
The page background is those two ink fields plus a halftone dot screen over `--color-stock-100`.

**Glass panels are a third ink, not a floating card.** A `.pane` is two layers: a paper fill blended
normally with the `backdrop-filter` behind it, and a light ink tint over that set to
`mix-blend-mode: multiply`. So a panel reads as ink laid over ink rather than a pane hovering above a
page. This is the part that makes it glassmorphism *and* makes it ours: everyone else's glass floats,
and floating glass on a dark gradient is the generated look.

The split into two layers is not fussiness, it is the correction of a real defect. The first version
put the whole fill on `multiply`, and **multiply can only darken** — a near-white paper layer
multiplied over the ink fields left them essentially untouched, so panels never became a surface and
text sat directly on the loudest part of the background. It was unreadable. Dropping to a tint is also
truer to the metaphor: a press does not print body copy over a solid ink field, it drops to a tint or
knocks the type out.

Concretely, in `apps/frontend/src/index.css`:

- **Tailwind is imported**, and an `@theme` block defines the tokens, which is what finally makes the
  existing class names resolve.
- **`stock`** replaces `vault` — an eleven-step ramp from paper `#EDE7D6` to key ink `#18160F`, warm
  biased. `signal` (ink A, `#E8452E`) and `solved` (ink B, `#0B7FBF`) keep their names because their
  meanings carry over exactly: one is *act here*, the other is *done*.
- **`--color-overprint: #0A2222`** is not chosen by eye. It is ink A multiplied by ink B, which is
  what a press would actually give us.
- **Zero border radius. Hard offset shadows** (`3px 3px 0`), never a soft blur — ink does not diffuse,
  and a blurred shadow is precisely what makes a panel read as a card.
- **Two typefaces, self-hosted**: Syne for display, Martian Mono for everything functional. Both
  variable, both SIL OFL, vendored into `src/assets/fonts/` with their licences. No font CDN request,
  so nothing renders in a fallback face while a third party is slow.
- **Component classes** — `.pane`, `.pane-inset`, `.btn`, `.field`, `.label`, `.veil`, `.rule` —
  because each is several properties that only mean something together. A `.pane` missing its rim or
  its shadow is not a cheaper pane, it is a broken one.

### The blur is the lock state

The one idea the whole system is built around. **A room you cannot enter yet is frosted**: you can see
there is a room without being able to read it. Solving clears the glass.

This makes the blur do a job instead of decorating one, which is the difference between glass as a
material and glass as a filter. It is implemented as `.veil` and applied to the rooms list in
`App.tsx`.

It is **cosmetic and only cosmetic**. The server refuses a locked room outright and never sends its
contents (ADR-0006). This is that fact made visible, not the thing enforcing it. Screen readers still
receive the room name, which is correct — the room ids were never the secret.

### The signed-in page is tabbed

The page had grown to five sections stacked down one 672px column — game status, rooms, leaderboard,
friends, party and the activity log, all competing at the same level, all visible at once, and getting
worse with every feature. It read as crushed because it was.

`src/ui/Tabs.tsx` splits it into **Rooms · Friends · Leaderboard · Activity**, with the container
widened to `max-w-5xl` and top-aligned rather than vertically centred — centring a page whose height
grows with its content makes everything jump the moment a panel appears.

Three properties of it are load-bearing:

- **Only the open tab is mounted.** Friends and chat poll the API on a timer. Keeping all four alive
  would multiply that polling across panels nobody is looking at.
- **The selection lives in the URL hash**, so a reload keeps you where you were and `/#friends` is a
  link somebody can send. Written with `history.replaceState`, so switching tabs does not fill the
  back stack with entries the player then has to walk out of.
- **Arrow keys move between tabs**, with a roving `tabindex` so the strip is one tab stop rather than
  four. This is the WAI-ARIA tabs pattern, and it is the first thing anyone on a keyboard tries.

The game status strip stays *outside* the tabs: which room you are on is true regardless of which tab
you are looking at.

### Rules that ship with the system

These are binding, not stylistic preference. Each one is a defect if broken:

1. **Never put `overflow: hidden` on an ancestor of `.pane`.** It disables `backdrop-filter` on every
   descendant, silently, with no error. This is the single most common way glassmorphism breaks.
2. **`--pane-alpha` stays above 0.8, and the panel fill is never `multiply`.** Both of these are the
   readability of every word in the app. Multiply cannot lighten, so a panel blended that way is not a
   surface; and below about 0.8 alpha the ink fields show through strongly enough to eat the contrast
   of body text.
3. **Ink A means "you can act on this" and nothing else.** Used decoratively it stops meaning
   anything.
4. **`prefers-reduced-transparency` flattens every pane**, and `prefers-reduced-motion` removes the
   travel. Both are why the blur radius and alpha are custom properties rather than literals — one
   rule changes the whole app.
5. **Radii are per-context, never global.** A single radius across a whole product is a tell.
6. **No purple, no Inter, no soft blurred shadows, no equal cards in a row.**

The avatar palette follows from the same logic. It had eight arbitrary pastels, one of which
(`#c4a2f5`) was the exact purple off the generated-design list. It is now eight colours the two inks
could actually produce — ink A, ink B, and the two crossed at different tint densities — which is why
there is no green, no purple and no yellow in it. All eight clear 7:1 against the initials.

## Consequences

**Good**

- The app has a design, and every class name written over the past three days now resolves. The built
  stylesheet went from 1.7 KB of dead starter theme to 21 KB of the actual system.
- Changing the whole look is one `@theme` block. Nothing below it hardcodes a colour.
- Accessibility is handled at the token layer rather than per component, so a new room cannot forget
  it.
- No network request for fonts, and no flash of fallback type.
- It is genuinely difficult to mistake for generated output, which was the requirement.

**Bad**

- **Martian Mono is a wide face.** It is set with negative letter-spacing to compensate, and it is
  still not a face for long prose. The app has very little long prose, so this is acceptable — but
  anyone adding a paragraph of body copy will feel it, and should reach for Syne 400 instead.
- **`mix-blend-mode: multiply` is fragile in a specific way.** Give `.pane` a stacking context of its
  own — `isolation: isolate`, `transform`, its own `z-index`, `opacity` below 1 — and the fill blends
  against the panel instead of the page, and the effect flattens with no error. The pseudo-elements
  use `z-index: -1` deliberately to avoid needing one.
- **A light design is less forgiving than a dark one.** Dark hides imprecision; paper does not. Every
  edge, shadow and contrast decision is visible, and sloppy work will show.
- **The two-ink rule constrains everybody.** Rooms cannot introduce a third colour without breaking
  the premise. This is the point, and it will occasionally be annoying.
- 89 KB of fonts is real weight, even subset to latin.

**Notable**

- `vault-*` is gone from the codebase. Anyone with a branch open will conflict on class names, and the
  ramp *inverts* — `vault-900` was a dark surface, `stock-900` is dark ink, so the fix is not a rename
  but a re-reading. The mapping used is in the pull request.
- Inaam owns the Figma work and these token names are what she would draw against.

## Alternatives considered

**Vitrine** — a museum display case, light, with faintly green-edged glass and Instrument Serif
throughout. The most elegant of the three and the best conceptual fit: glass as the thing stopping you
touching the object is exactly a locked room. Lost because it is quiet, and an escape room built by
four people in a week benefits more from a design with some volume to it.

**Instrument** — a machined control panel in warm graphite, Bricolage Grotesque, diagonal sheen across
curved cover glass. Rejected as the closest of the three to the near-black-plus-one-accent cluster,
even done carefully. Warm graphite is not black, but it is a short walk from it.

**Keeping the dark scaffold palette and just defining the missing tokens.** Cheapest possible option —
about twenty lines — and it would have produced exactly the generated look the brief ruled out.

**Full Liquid Glass with SVG refraction** (`feDisplacementMap` plus `feSpecularLighting`, displacement
map generated in canvas). Demonstrably works, and only in Chrome — an SVG filter as a
`backdrop-filter` is unsupported in Safari and Firefox. Two of the browsers in the room on Friday
would silently fall back to flat glass. Available later as pure progressive enhancement on top of what
we built; not a foundation.
