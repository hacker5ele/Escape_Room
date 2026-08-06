# ADR-0049: A second riddle act — Mount Olympus — after the Atlantis quest

- **Status:** Proposed
- **Date:** 2026-08-05
- **Deciders:** Inaam Ahmed
- **Approved-by:** _(pending — awaiting Nepomuk Crhonek's review)_
- **Superseded by:** [ADR-0052](0052-olympus-carpet-race.md)

> **Superseded 2026-08-05.** Olympus is a carpet-racing coin challenge, not a riddle sequence — see
> ADR-0052. `OLYMPUS_RIDDLES` and the two-act (`sphinx` | `olympus`) split described below no longer
> exist in `room-03.ts`. This document is kept for the reasoning trail (in particular, the event-log
> replay technique it built on top of, which ADR-0050 and ADR-0052 both still rely on for the Sphinx's
> own five riddles).

## Context

Room 3 already ends with the Atlantis quest (a client-only exploration mini-game after the Sphinx's five
riddles, see the Atlantis-quest ADR). The request was for a third beat after that: once Poseidon's
artifacts are all restored, the player is sent back into the light and arrives at Mount Olympus — a
grand hall where the assembled Greek gods pose their own puzzle before the room is truly finished.

Two things had to be decided, both interface-shaped for the same reason ADR-0047 and ADR-0048 already
established for this room — a new stage needs somewhere to live without a `GameSession` schema change:

**Where does "which act, and which riddle within it" live?** Same answer as before: nowhere new.
`room-03.ts`'s `currentProgress()` already derives riddle stage and hearts by replaying `session.events`.
Extended here to also derive *which act* the player is in — there is no event marking "the Sphinx's five
are done, Olympus begins," because Atlantis (the thing that happens in between) produces no server
events at all. The split is inferred structurally instead: replay `SPHINX_RIDDLES` first; once its 5 are
cleared with the run still intact, every `room-03` attempt after that point is necessarily an Olympus
attempt, and replay continues against `OLYMPUS_RIDDLES` from there.

```ts
type Act = 'sphinx' | 'olympus'

function currentProgress(session): { act: Act; stage: number; hearts: number } {
  // replays room-03 attempts; once SPHINX_RIDDLES is exhausted, switches to
  // OLYMPUS_RIDDLES for the rest of the replay — see room-03.ts
}
```

**Does `publicData()`'s payload need a new field to say which act is active?** Yes — `act: 'sphinx' |
'olympus'` — and same as `hearts`/`maxHearts` before it, this is safe without touching
`packages/shared`: `RoomPublicData.data` is `z.record(z.string(), z.unknown())`, an intentionally opaque
per-room bag (ADR-0007's room-plugin contract already allows this).

## Decision

**`SPHINX_RIDDLES` (the original five, rewritten harder — see below) and a new `OLYMPUS_RIDDLES` (five
more, posed by Zeus, Hermes, Ares, Hera, and the Council in turn) are two separate arrays in
`room-03.ts`.** `currentProgress()` and `riddleAt(act, stage)` both take the act into account.
`hints` stays one flat pool (`[...SPHINX_RIDDLES, ...OLYMPUS_RIDDLES].map(r => r.hint)`), since
`room.service.ts`'s `hint()` already indexes purely by total hints used, not by riddle or act — no
change needed there.

**Losing the last heart on Olympus resets all the way back to the Sphinx's riddle 1, not just to
Olympus's own riddle 1.** This matches "you lost this run" from ADR-0048: Olympus is only reachable by
going through the Sphinx and Atlantis again, same as the first time. `currentProgress()`'s reset branch
sets `act` back to `'sphinx'` regardless of which act the miss happened in.

**The frontend gets a new `EndingPhase` state:** `'poseidon-greeting'` → `'poseidon-exiting'` →
`'olympus'` → `'won'`, inserted after Atlantis's own quest-complete moment (previously that went
straight to `'won'`). `'poseidon-greeting'` is Poseidon's own farewell line, deliberately mirroring the
Sphinx's `'chamber-greeting'` beat, followed by the same whiteout-and-walk-into-the-light transition
already used once. `game/olympus.ts` is a new, mostly-static scene (columns, a row of thrones, clouds
below an open colonnade) — static rather than scrollable like Atlantis, since Olympus is a
dialogue-driven riddle sequence (the player stands still while questioned), not an exploration quest.
The dialogue overlay itself (typewriter, countdown, multiple-choice buttons, wrong-answer flash) is a
second copy of the corridor's own overlay state machine, kept separate rather than shared because the
corridor's version is entangled with `stateRef`'s walking/attack-animation mechanics that don't apply to
Olympus's static hall.

**The Sphinx's five riddles were also rewritten, independently of the act split, to be substantially
harder.** The previous set (shadow / echo / silence / time / death) used single-clue misdirection with
fairly separable wrong answers. The new set uses longer, multi-clause setups where the wrong choices are
closer, more plausible distractors (e.g. "a name" vs. "a language" vs. "a blessing" as answers to a
riddle about inherited debt), while keeping every clue independently and literally true of the intended
answer — the same standard that fixed the earlier "Silence"/"Time" riddles' broken internal logic.

## Consequences

- Room 3 is now a three-act structure: Sphinx corridor (server-checked) → Atlantis (client-only) →
  Olympus (server-checked again). Each act's own ADR documents why it's shaped the way it is; this one
  is the connective layer between the second and third.
- `currentProgress()`'s replay is now a two-phase loop instead of a flat one. Still O(events), still
  well inside the 500-event cap.
- A player who reaches Olympus, then opens a second tab and replays the Sphinx from scratch in it, could
  produce a `session.events` history where the "5 sphinx riddles then N more" inference gets confused
  about which N belong to which run — an accepted edge case in the same class already named in
  ADR-0048 (Atlantis's own local-vs-server drift under a second tab), not worth solving for.
- `apps/frontend/src/rooms/preview.tsx`'s mock riddle set was updated to match the new Sphinx riddle
  text/answers exactly, since it's hand-synced and has no build-time check tying it to `room-03.ts`
  (documented limitation, unchanged from ADR-0047).

## Alternatives considered

**A fourth room (`room-05`) instead of extending room-03's own act count.** Rejected: Olympus is
described as directly continuing from "after you win in Poseidon's room," narratively and mechanically
part of the same run, not a separately-entered room a player could reach out of order. It also would
have needed a new room-ownership assignment under ADR-0007, where room-03 already has one.

**Encode the act boundary as a special value in the stored `answer` string** (e.g. prefixing Olympus
answers) instead of inferring it structurally from riddle-count exhaustion. Rejected: fragile and
needlessly clever — it would work only as long as nothing else ever touches the `answer` field's
contents, whereas counting "5 correct sphinx-shaped answers in an unbroken streak" falls directly out of
data already being replayed for stage/hearts, no extra bookkeeping required.
