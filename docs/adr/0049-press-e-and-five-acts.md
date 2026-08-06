# ADR-0049: Press E — the hall says what it does, and grows two more acts

- **Status:** Accepted
- **Date:** 2026-08-06
- **Deciders:** Nepomuk Crhonek
- **Approved-by:** Nepomuk Crhonek, 2026-08-06
- **Amends:** [ADR-0048](0048-the-hall-floods.md)

## Context

[ADR-0048](0048-the-hall-floods.md) built the Reading Hall as a place you play by walking, and made
**standing on a station be the action**. That bought something real — a twice-a-second position
sample was suddenly enough to run a room on — and it cost something that only showed up once people
played it:

**The room was mute.** You walked into a lamp and it lit with no warning. You could walk the length
of the hall and trip four mechanisms without meaning to. And you could walk right past the vault
without ever learning it was the vault, because nothing in the room ever said what anything was.

Three other things were wrong at the same time:

- **The water was too fast.** Forty-six seconds of doing nothing and you drowned, which is not enough
  time to read a caption, let alone think about a puzzle. The tide stopped being a clock and became a
  hurry.
- **The sea was a blue rectangle** with one wave strip scrolling across it.
- **The code was typed into a small box floating at the bottom of the stage** — the least interesting
  possible presentation of the room's climax.

## Decision

### Walk up to a thing and press E

A prompt appears when you are near enough for E to mean something, and **it says what E will do**:
*light the lamp*, *take the tablet*, *set it down*, *turn the wheel*, *wind the winch*, *work the
drums*. Three kinds — one-off, take-hold, and hand-the-screen-over — and the tag says which.

**The prompt is chrome, not world.** Everything inside the stage is drawn in 1600×900 units and
scaled once to fit, about 0.2 on a phone, so a tag floating over the lamp would be four-pixel type.
The station is ringed in the world; the words live in the chrome at a readable size.

**It is a button.** There is no E key on a phone, and rule 8 asks for usable rather than merely
unbroken.

### What travels, and why it is honest this time

Two fields on the heartbeat request:

```ts
acted: z.array(z.string().max(32)).max(8).default([]),   // an event, consumed by the beat carrying it
holding: z.string().max(32).nullable().default(null),    // state, re-sent every beat
```

ADR-0048 removed a field like this and was right to: engagement was derived from position, so naming
your own station added a thing to forge and bought nothing. **Engagement is now a choice, and a
choice cannot be derived** — so it has to be sent.

Both are **verified against the position on the same beat**, in the mechanism itself rather than only
in the service that assembles it. A test caught that distinction the hard way: with the check only in
`HallService`, a hand-made occupant claiming a wheel at the far end of the hall pumped it happily.

**Defaulted rather than required**, and that is not politeness. This beat goes out twice a second
from every open tab, so the moment a deploy lands, every player who has not reloaded is running the
previous script. Required fields would `400` all of them until they did, and vanishing out of your
friends' lobby is a strange way to find out a release happened.

**A press does not wait for the next beat.** `usePresence` gained a `flush()` that beats immediately,
debounced to 250 ms — half a second is a long time for a lamp to take, and a room where E feels
sticky is a room that feels broken.

### The water, slowed to two and a half minutes

| | was | now |
| --- | --- | --- |
| doing nothing | 46 s to drowned | **150 s** |
| one wheel | held the level exactly | **creeps it back** |
| both wheels | fell | **falls three times faster** |

Pump is now larger than rise, which loses a tidy rule and wins a better game: one player used to be
able to tread water and nothing more, and clearing the last thirty points before the vault took a
minute and a half of two people standing still.

`tideTrend` had to change with it. It reads the **rate** rather than counting wheels, because those
two stopped agreeing — one wheel would have had the gauge saying *holding* while the water visibly
fell.

### A sea worth looking at

Seven layers over the one generated wave strip: a depth-graded body, three drifting caustics, **two
parallax crests**, foam, rising bubbles. The parallax does most of the work — same drawing, different
scale and speed, which is how a background painter has always faked depth and costs one extra `<img>`.

Everything below the crest stays flat ink and a coarse dot screen. A gradient-heavy "realistic" sea
would undo the print pipeline the whole room rests on.

### Five acts

| | alone | together |
| --- | --- | --- |
| **I — the lamps** | five, each burning 16 s, all alight at once | paired east/west, **within two seconds of each other, by different people** |
| **II — the index** | five tablets into five pedestals in the staff's order | the floor opens down the middle and takes what you carry into it |
| **III — the great wheel** *(rebuilt)* | **a pattern on the gearbox**: which wheel, which way, four steps — one wrong and it starts again | the plaque at your end describes the **far** wheel |
| **IV — the sluice gate** *(new)* | a twenty-second hold on one winch | **both winches, and it only moves while both are held** |
| **V — the vault** | six drums, full screen | one holds a wheel while the other works them |

**"At the same time" had to become "within a moment of each other"**, because a keypress cannot be
simultaneous the way standing somewhere can. Two seconds is long enough to count down out loud and
short enough that nobody can sprint between the ends and do both.

**Act IV is the only act that pays in mechanics rather than figures**: shutting the sluice halves the
rise for the rest of the run. It is also the only act with no puzzle in it, deliberately — it is a
*decision*. Twenty seconds of winding is twenty seconds nobody is on the pump wheels, and the
question is whether you can afford it.

### The vault, full screen

Six odometer drums on the `.countdown` overlay precedent — fixed inset, dimmed, blurred — because
that is already this app's way of saying *everything else can wait*.

**A real `<input>` sits behind the drums, invisible and focused.** It looks like a trick and is doing
three jobs honestly: typing works with no hand-rolled key handler, mobile gets its numeric keyboard,
and `useMovement` already ignores keys while a field has focus — so walking suspends itself while the
vault is open, with no new wiring at all.

## Consequences

**Good**

- The room can be understood by playing it. Nothing has to be guessed at or discovered by accident.
- Walking through the hall no longer trips mechanisms on the way past.
- The tide is a clock again rather than a panic, and act IV lets you buy more of it.
- Two more acts, and four *different* shapes of co-operation across them — simultaneity, hand-off,
  information asymmetry, and a shared commitment neither of you can make alone.

**Bad**

- **A second contract change in two days.** Additive, defaulted, and flagged for rule 7 — but the
  team should hear it rather than find it.
- **ADR-0048's central input decision is reversed.** Its reasoning was sound and is worth keeping
  written down: standing *was* enough while the room had one thing in it to do.
- **A phone is cramped.** The stage is 320×180 there and the HUD had to become chips. The room works
  at 320px; it is not where it is at its best.

**Notable**

- The four bugs in ADR-0048 were found by rendering and measuring. So were this round's: the crest
  crop landing on the drawing's filled foam, which made the sea read as mounds sitting on the water
  rather than its surface, took three passes of *look at it, move the crop, look again*.
- One of the new integration tests found a wart nobody would have seen until a demo: the hall was
  created by whichever beat arrived first and counted only who was standing at that instant, so two
  people walking in together got the solo shape for five full seconds before it re-formed.

## Alternatives considered

**Keeping standing-as-input and adding a label.** The cheapest fix, and it does not solve the real
problem: walking past would still trip things, and a label on something that acts before you have
read it is not much of a warning.

**Hold E rather than press it, for the wheels.** One fewer concept than press-to-grab and
press-to-let-go, and it makes pumping while doing anything else impossible — including reading the
room. Taking hold is a state you can leave, which is what a pump wants to be.

**A rotary dial for the vault**, matching the generated art exactly. Better looking and worse under
pressure: aiming at a notch on a circle is fiddly on a trackpad and awful on a phone. Drums take a
nudge, a drag or a typed digit.
