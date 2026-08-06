# ADR-0037: The lobby, the stage, and rooms you can actually play

- **Status:** Accepted
- **Date:** 2026-08-05
- **Deciders:** Nepomuk Crhonek
- **Approved-by:** Nepomuk Crhonek, 2026-08-05

## Context

The project had accounts, friends, chat, co-op parties, characters, a design system and a deployment
pipeline — and no way to play.

`apps/frontend/src/rooms/` did not exist. `GET /api/rooms/:roomId`, `POST /attempt` and `POST /hint`
had been built, tested and deployed since the scaffold and **had never once been called from a
browser**. The Rooms tab was a list of four names. That, and nothing else, is why nothing was
playable.

## Decision

**Start → Lobby → Room**, where the lobby is a printed 1950s room the party stands in the middle of.

There is deliberately **no "play alone or with a friend" dialog**. Everybody lands in the lobby and a
lobby of one is simply a lobby of one. That removes a decision from the fastest path, and it means
the room friends arrive in is the room you were already standing in.

### The look: Fortnite's structure, never its skin

The information architecture — a party standing about, a ready toggle, a room to pick, one big
button — is borrowed because it is proven and everybody already knows how to read it. **None of the
look is.** Dark gradients, glossy blue and neon glow are both off-brand and the most generic thing on
the internet; not one Fortnite colour appears anywhere.

Everything is Overprint (ADR-0032) and the 1950s cartoon of the character art (ADR-0033).

### Scenery is generated, through the character pipeline unchanged

Thirty-five pieces — two backdrops, twenty-six props, four decorations — generated with
`gpt-image-1` and put through `scripts/characters/process.py` **exactly as written**: cut out, median
filter, posterize to the four inks, hard key outline, halftone.

That reuse is the entire reason this works. A potted palm and a player's head come off the same
press, so they cannot drift apart, and the consistency is mechanical rather than a matter of getting
the prompts right. Only the sizing differs, because a wall and an arm want different treatment.

**Backdrop and props are separate images, deliberately.** One flat painted scene cannot have a
character walk *behind* the armchair.

### One stage, two uses

`stage/Stage.tsx` is the lobby and every room, with different scenery and different chrome. Less
code, and the reason walking behaves identically everywhere.

- A fixed **1600×900 coordinate space**, scaled once by a single CSS transform. A position means the
  same thing on a phone and a laptop, and nothing below the stage reads the size of the window.
- **Everything is placed by its feet** — props and players alike — and the whole lot is sorted by
  `y` in one pass. That single sort is what makes walking behind the sofa work; without it the room
  is a painted backdrop with stickers on it.
- **A `depth` override** for things that lie flat. A rug sits at the front of the room but has to
  draw *behind* whoever is standing on it, and its base would otherwise sort it over their feet.
- **Movement** is `WASD`/arrows and drag-anywhere on touch, integrated against real elapsed time in
  a `requestAnimationFrame` loop rather than driven by key-repeat — which is both slower and less
  even than the screen refreshes.

Two numbers were set by looking rather than by taste, and both were wrong first time: characters
render at 430 stage units because at 300 they were the same height as the sofa, and they spawn at
y≈800 because at 700 they stood *behind* the furniture.

### Sound is synthesised, not sourced

`audio/sfx.ts`: ten effects, about 250 lines, **zero asset files**. 1950s cartoon effects genuinely
*are* swept oscillators — a slide whistle is a sine with a pitch ramp, a boing is that ramp with a
wobble — so synthesising them is the honest reproduction rather than the cheap substitute. Nothing to
download, nothing to license, and every sound tunable by changing a number.

**The `AudioContext` is built on the Start click and nowhere else.** A context created on page load
starts suspended and, in Safari, stays that way; Start is the first gesture in the flow *by
construction*, which is what makes it the only correct place. Every failure path is silent — if audio
is refused the game works without it.

### Emotes cost no artwork

The character is six sprites on a rig whose limbs already rotate about real joints (ADR-0033), so an
emote is a block of CSS keyframes. Eight of them, each chosen to read **in silhouette** — which is
what survives being four inches tall on a projector.

### Motion is cartoon, which is a specific vocabulary

Anticipation, squash and stretch, overshoot, a settle. **Nothing fades in**, because the linear fade
is precisely the motion that reads as machine-made. Characters drop in and squash on landing; the
ready toggle stamps like rubber on paper; locked room tiles shiver and refuse; the countdown numbers
stamp in at 3× and settle.

The transition is a canvas **ink flood**: the page's own two inks bloom into sixty bubbles under a
halftone screen, swallow the screen, and drain away. Canvas rather than CSS because it is dozens of
overlapping shapes under a dot screen, and the artwork pipeline already proved the screen is what
stops it reading as a gradient. **The screen underneath changes at full cover**, so the swap is never
seen.

`prefers-reduced-motion` replaces the flood with a 120 ms fade and holds every emote as a pose rather
than removing it — calming a feature down instead of taking it away.

## Consequences

**Good**

- The game is playable. The API that made it possible was already there and tested.
- `rooms/registry.tsx` is the seam ADR-0007 promised: a sub-team writes a puzzle and touches nothing
  else. Three stubs are wired to real endpoints and waiting.
- One stage means one place to fix walking, depth or scenery for both the lobby and every room.
- 1.6 MB of scenery, served as static assets like everything else. No new infrastructure.

**Bad**

- **No multiplayer yet.** You walk around alone. Seeing a friend move needs the presence heartbeat,
  which is the next phase and the one that needs `packages/shared`.
- Scenery is generated art and is not uniformly good. Three pieces came back as filled boxes rather
  than cut-outs and were regenerated with tighter prompts; more will need the same eye.
- The lobby's party rail shows only you, because parties are not wired to the stage yet.
- 2.7 MB of art now ships with the frontend. Cached hard, but it is real.

**Notable**

- `scripts/scenery/` and `scripts/characters/` both had a module called `parts`, and Python resolved
  the wrong one. The scenery catalogue is `catalogue.py` for that reason.
- 54 MB of raw model output is gitignored and reproducible.

## Alternatives considered

**A mode dialog before the lobby**, as originally planned. Cut on the grounds that it asks a question
whose answer is almost always "just start", and the lobby already answers it by existing.

**One painted backdrop per room.** Half the pieces and none of the depth — a character could never
walk behind anything, which is most of what makes the stage read as a room.

**Sourced audio files.** Richer, and it needs a licence I cannot verify for a project that is
presented publicly, plus several hundred kilobytes and an asset pipeline. Synthesis has neither
problem and suits the period.

**A CSS transition instead of the canvas flood.** Cheaper and smoother — and smooth is the tell. The
halftone is what ties the transition to the artwork, and it needs pixels.
