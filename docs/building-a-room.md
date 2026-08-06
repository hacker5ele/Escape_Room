# Building a room

For Abigail and Eleonora, and for whoever picks up rooms 03 and 04.

A room is **two files and two registry lines**. Everything else — entering, the answer box, hints,
the solved celebration, walking around, seeing your friend walk around — already exists and is
already tested. You should not have to touch anything outside the four places listed here.

| | |
| --- | --- |
| The puzzle and its answer | `apps/backend/src/domain/rooms/room-0N.ts` |
| What the player sees | `apps/frontend/src/rooms/room-0N.tsx` |
| The name on the door | one entry in `apps/frontend/src/rooms/registry.tsx` |
| The expected answer, for tests | one line in `apps/backend/src/domain/rooms/solutions.fixture.ts` |

The files already exist with placeholder puzzles in them. Replace the contents; keep the shape.

---

## 1. The puzzle

`apps/backend/src/domain/rooms/room-02.ts`. This is where the answer lives, and the **only** place it
lives.

```ts
import type { RoomDefinition } from '../room-definition.js'
import { asNumber } from '../answer.js'

const SOLUTION = 90

export const room02: RoomDefinition = {
  id: 'room-02',
  title: 'The Server Room',
  intro: 'The door clicks shut behind you. One display is still lit.',
  prompt: 'The lock wants a decimal number. The display only speaks binary.',

  hints: [
    'Read the digits from right to left. Each position is worth twice the one before it.',
    'The positions are 64, 32, 16, 8, 4, 2, 1 — add the ones where the digit is 1.',
    'It is 64 + 16 + 8 + 2.',
  ],

  publicData() {
    return { binary: '1011010' }
  },

  check(answer) {
    const value = asNumber(answer)
    if (value === null) return { correct: false, feedback: 'The lock takes digits only.' }
    if (value === SOLUTION) return { correct: true }
    return { correct: false, feedback: value > SOLUTION ? 'Too high.' : 'Too low.' }
  },
}
```

**Four rules, and a test enforces each one.**

**`publicData()` must not contain the answer**, or anything the answer falls straight out of.
Everything it returns is sent to the browser, where the player can open the network tab and read it.
This is ADR-0006 and it is what has to survive Thursday, when the other team tries to break the app.

**`check()` receives whatever the client sent.** It is typed `unknown` on purpose — treat it as
hostile and narrow it yourself. `asNumber()` and `asText()` in `../answer.js` do this; a room that
calls `answer.trim()` directly crashes the API the first time somebody posts a number.

**Feedback is a nudge, never the answer.** `'Too high'` is good. `'It is 90'` is not a puzzle.

**Hints go from vague to nearly explicit, in order.** Three is a good number. They are counted per
room, so spending all three here costs the player nothing in the next room
([ADR-0043](adr/0043-hints-are-per-room.md)).

Then add the answer to `solutions.fixture.ts` so the suite can prove it never appears in an HTTP
response:

```ts
export const SOLUTIONS: Record<RoomId, unknown> = {
  'room-02': 'ESCAPE ROOM',
}
```

You do not need to write tests for the rules above. `rooms.test.ts` runs all of them against every
room in the registry automatically — including that your room accepts its solution, rejects a wrong
answer, survives hostile input types without throwing, and ships neither its solution nor its hints
to the browser. **Run `npm run test` and your new room is already covered.**

## 2. What the player sees

`apps/frontend/src/rooms/room-02.tsx`. Small, because `RoomView` around it does the rest.

Your component renders **inside the stage**, as a panel floating over the scenery — which is why it
needs `pointer-events-auto`. The stage swallows pointer events to walk the player around, so a room
that forgets this ends up with an answer box nobody can click into.

```tsx
import { useState } from 'react'
import type { RoomProps } from './registry'

export function RoomTwo({ room, onAnswer, busy }: RoomProps) {
  const [value, setValue] = useState('')

  return (
    <div className="pane pointer-events-auto max-w-[42ch] p-4">
      <p className="prose text-sm text-stock-700">{room.prompt}</p>

      {/* Whatever `publicData()` returned on the server arrives as `room.data`,
          typed `Record<string, unknown>` — so narrow it here. */}
      <p className="mt-3 text-center font-mono text-2xl text-signal-600">
        {String(room.data.binary)}
      </p>

      <form
        className="mt-4 flex gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          onAnswer(Number(value))
        }}
      >
        <input
          className="field flex-1"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          disabled={busy}
          aria-label="Your answer"
        />
        <button type="submit" className="btn" disabled={busy}>
          Try it
        </button>
      </form>
    </div>
  )
}
```

**Three props are all most rooms need.** `room` is what the server sent, `onAnswer` hands a value
back, `busy` is true while an attempt is in flight — disable your inputs on it or a double-click
sends two attempts.

Two more arrive for the rooms that want them, and you can ignore both:

- **`actors`** — everybody standing in the room, you included, already interpolated.
- **`live`** — the room's own state, arriving on the heartbeat twice a second, and **`null` for every
  room that is a question and a box.** A room only gets one if the server is running a clock for it.
  That is how room 01 works: see [ADR-0048](adr/0048-the-hall-floods.md), and note that what is
  inside `live.detail` is each room's own business — narrow it in your room, the way you already
  narrow `room.data`.

There is also an optional **`renderWorld`** beside `render` in the registry. `render` returns chrome,
which floats over the stage in screen pixels; `renderWorld` returns things drawn **inside** the
stage's own 1600×900 space and depth-sorted with the players, so you can put objects in the room that
somebody walks behind. Most rooms should not need it — furniture that stands still belongs in
`scenes.ts`, where it costs no rendering at all. It is for furniture that changes while you watch.

One trap if you do build a station players walk up to: a zero-size positioning `<div>` with its
artwork hung off it by negative margins will render that artwork **at zero width**, because
Tailwind's preflight sets `img { max-width: 100% }` and 100% of nothing is nothing. Set
`max-width: none` on the image. The scenery props escape this only because their parent is the whole
stage.

**You do not build**: entering the room, the locked-door message, your room's `intro` line, the
answer feedback, the hint button, the emote bar, the solved celebration, the way out, the stage
behind you, or the other players walking around on it. All of that is `RoomView` and it is the same
for every room. Your component is only what makes *this* room itself.

Then name the door in `registry.tsx`:

```tsx
'room-02': {
  id: 'room-02',
  title: 'The Server Room',
  tagline: 'One display is still lit.',
  scene: 'vault',
  render: (props) => <RoomTwo {...props} />,
},
```

`title` and `tagline` are what the lobby's room picker shows. `scene` chooses the scenery the stage
dresses itself with — `'lobby'`, `'vault'` or `'hall'` today, and section 4 is how you add another.

## 3. Making it look like the rest of the app

Build with the design system's classes and **do not write a colour**. `.pane`, `.pane-inset`,
`.btn`, `.btn-ghost`, `.field`, `.label`, `.prose`, `.veil`, and the `stock` / `signal` / `solved`
tokens. A hex code anywhere in a room is the one thing that will make it look bolted on.

Three rules break the design *silently* — nothing errors, it just goes flat and you will spend an
hour wondering why:

- **Never put `overflow: hidden` on anything above a `.pane`.** `overflow` other than `visible` on
  any ancestor kills its `backdrop-filter`, and the panel stops being glass. This is why
  `.stage-frame` is explicitly not clipped.
- **Never give a `.pane` its own stacking context** — no `transform`, `filter`, `opacity < 1`,
  `will-change` or `isolation` on the panel itself. Put it on a wrapper.
- **Never blend a panel *fill* with `multiply`.** Multiply can only darken, so a near-white paper
  fill multiplied over the ink fields leaves them untouched, the panel stops being a surface, and the
  text ends up sitting on the background. The tint layer multiplies; the fill does not.

If your room adds a big block of its own, mark it `data-piece` so the screen transition treats it as
one thing, or `data-piece="no"` to leave it out ([ADR-0044](adr/0044-unbuild-into-dots.md)).

Everything must work **from 320px up** — that is rule 8 in `CLAUDE.md`. Check it at 320, 768 and
1440 before you open the PR.

---

## 4. Making the art

Scenery is generated with OpenAI's image model and then *printed*. The generation is the easy half;
the printing is the half that matters, and it is what stops the result looking AI-generated.

### Add your pieces to the catalogue

`scripts/scenery/catalogue.py`. Each entry is a name, a height in stage units, and a prompt.

```python
"study-desk": {
    "height": 210,
    "prompt": "A plain wooden writing desk with a drawer and turned legs, seen from the front.",
},
"study-wall": {
    "height": 620,
    "wide": True,
    "prompt": (
        "A flat section of panelled wall for a 1950s study, seen straight on. "
        "Just the wall surface, edge to edge, nothing on it."
    ),
},
```

`height` is in stage units. The stage is 1600×900 and a character stands about 340 tall, so a
400-unit lamp reads as slightly taller than a person. `wide: True` marks the pieces scaled to the
stage *width* instead — a wall or a floor has to span it regardless of how tall the drawing came
back.

**Two rules govern every entry**, and they are not stylistic:

- **Objects only, never people.** A backdrop with a painted figure in it competes with the actual
  players standing in front of it.
- **Every piece is a separate cut-out.** One flat painted scene cannot have a character walk *behind*
  the armchair. Props are placed with a depth value and sorted against the players — that is what
  turns a picture into a room.

Do not repeat the style in your prompt. `prompt_for()` appends the shared `STYLE` and `COMMON`
blocks, which is exactly why every piece looks like it came from the same hand: **what differs
between two prompts is the subject and nothing else.**

### Generate, then print

```bash
OPENAI_API_KEY=... python3 scripts/scenery/generate_all.py
python3 scripts/scenery/process_all.py
```

`generate_all.py` is **resumable** — anything already on disk is skipped, so the fix for a partial
run is to run it again. You will need to. Roughly **one call in four comes back HTTP 520** from
Cloudflare with an HTML body, and `gpt-image-1` rate-limits at about three concurrent requests.

Two things about the generation that cost real time to find:

- **`gpt-image-1`, not `gpt-image-2`.** Only `gpt-image-1` accepts `background: "transparent"` and
  cuts the piece out for you. `gpt-image-2` rejects the parameter outright.
- **It goes through `curl`, not `urllib`.** A 1024×1024 response is over a megabyte of base64, and
  urllib truncated it often enough to be useless (`IncompleteRead(409600 bytes read, 1636233 more
  expected)`). curl retries the transfer itself.

`process_all.py` writes the finished pieces to `apps/frontend/public/scenery/` and regenerates
`apps/frontend/src/stage/scenery.json`, which the stage reads.

### Place them in a scene

`apps/frontend/src/stage/scenes.ts`:

```ts
const STUDY: Scene = {
  wall: 'study-wall',
  floor: 'study-floor',
  props: [
    { piece: 'study-clock', x: 1010, y: 270 },
    { piece: 'study-lamp', x: 520, y: 300, sway: 'swing' },
    { piece: 'study-desk', x: 170, y: 700 },
    { piece: 'study-rug', x: 800, y: 900, depth: 640 },
  ],
}
```

`y` is the ground line the piece stands on, and doubles as its depth — something further down the
screen is nearer, so it draws in front. `depth` overrides that for flat things: a rug lies at the
front of the room but has to draw *behind* whoever is standing on it. `sway` gives a piece a gentle
idle movement (`'leaves'`, `'swing'`, `'tick'`) — use it for the things that would actually move.

**Keep the middle of the floor clear.** The party lines up centre-stage, so anything placed there
ends up behind somebody's head.

---

## 5. Why it does not look AI-generated

This is the part worth reading twice, because it is the thing the whole art direction rests on and it
is almost entirely mechanical.

**The generated image is never used.** It is raw material. Every piece — every character part, every
prop — goes through `scripts/characters/process.py` unchanged, and comes out the other side as
something the model cannot produce directly:

```
harden_alpha → fit → despeckle → to_inks → add_key_edge → screen
```

`to_inks` **posterises the whole image to four colours**: paper `#EDE7D6`, warm red `#E8452E`,
process cyan `#0B7FBF`, and near-black `#18160F`. A generated part measured **16,744 distinct
colours going in and 8 coming out.** `screen` then lays a halftone over it at a 5px pitch.

That is the entire trick, and it is worth being precise about *why* it works:

**AI images give themselves away through their gradients.** Soft airbrushed falloff, a slightly
different palette in every image, ambient occlusion nobody asked for, that faint plasticky sheen.
Posterising to four fixed inks destroys all of it at once. There is no gradient left to be soft, and
because every piece is quantised to the *same* four values, eighty separately generated images stop
looking separately generated. **The consistency is mechanical rather than a matter of getting the
prompts right** — which is why the characters worked, and why the scenery reuses the character
pipeline byte for byte instead of having one of its own.

The halftone does the second half. Real screenprinting has a dot; a generated image does not. Adding
one puts the image in a physical process the model was never in.

### The prompt rules that came out of getting it wrong

- **Ask for what the printing needs.** `NO shading, NO gradients, NO highlights, NO drop shadow` in
  every prompt. Not because the model obeys perfectly, but because the closer the input is to flat,
  the less the posterise has to throw away — and what it throws away is where the artefacts live.
- **Name the palette in the prompt as well as enforcing it in code.** Belt and braces; the model gets
  it roughly right and `to_inks` makes it exactly right.
- **Nothing may have a handedness.** A peace sign generated for a right hand is, mirrored onto the
  left arm, the back of the hand — which is a rude gesture across most of Europe. It shipped once.
  Now: no gesture that changes meaning when mirrored, ever.
- **Frame the garment, not the body.** Asking for "a torso" gets you anatomy. Asking for "a knitted
  jumper" gets you a shape that reads as clothing at any size.
- **"Cut-out shape" needs saying loudly, and repeatedly.** The model likes to draw a helpful frame or
  backing rectangle around anything sign-shaped. `NO wall, NO square frame, NO background panel, NO
  backing rectangle` is in the vault door and the hazard sign prompts because both came back mounted
  on a plate the first time.

### Two Pillow traps

- **`MaxFilter` uses a square kernel.** `add_key_edge` dilates the artwork to build its outline, and
  at `width=11` it squared narrow shapes off — arms and legs came back as slabs. It is 2 now.
- **Decide on brightness, not saturation.** An earlier `to_inks` sent anything with `s < 0.18` to
  black, which turned every pale skin tone into black speckle.

---

## 6. Before you open the PR

```bash
npm run typecheck && npm run lint && npm run test && npm run build
```

Then play it — `npm run dev`, sign in locally (no Clerk keys needed), and actually solve your room.

- Does a wrong answer say something useful without saying the answer?
- Do all three hints appear, in order, and does the button stop offering a fourth?
- Open the network tab on `GET /api/rooms/room-02` — **is your answer in the response?**
- 320px wide?
- Does the room still work when a friend is standing in it?

Open the PR **against `dev`, never `main`**, and name the ADR it implements. If your room needs
something the `RoomDefinition` interface cannot express, that is a change to
`packages/shared` — which needs an ADR *and* prior agreement with the whole team, before the code is
written. Ask first; it is rule 7 and it is the one rule the assignment itself spells out.

## Where to look when something is confusing

| | |
| --- | --- |
| Why rooms are plugins | [ADR-0007](adr/0007-room-registry-and-ownership.md) |
| Why the server owns the answers | [ADR-0006](adr/0006-server-authoritative-puzzles.md) |
| The design system, and its silent failures | [ADR-0032](adr/0032-overprint-design-system.md) |
| The characters and the print pipeline | [ADR-0033](adr/0033-modular-characters.md) |
| The stage, and how props are placed | [ADR-0037](adr/0037-lobby-stage-and-rooms.md) |
| The HTTP contract in prose | [`api-contract.md`](api-contract.md) |
