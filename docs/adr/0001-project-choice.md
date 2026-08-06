# ADR-0001: Build Projekt A — the digital escape room

- **Status:** Accepted
- **Date:** 2026-08-03
- **Deciders:** Abigail Romero, Nepomuk Crhonek, Inaam Ahmed, Eleonora Vynogradova
- **Approved-by:** Nepomuk Crhonek, 2026-08-03

## Context

The assignment offers two projects: **A**, a digital escape room made of 2–4 sequential
rooms, and **B**, an arcade platform with a central highscore API. Monday morning is reserved for the
choice, and no code may be written before midday — so this decision has to be recorded before anything
else in this repository exists.

We are four people: three developers and one designer. Project B's value is concentrated in one shared
REST API that every mini-game talks to; the mini-games themselves are largely independent and shallow.
Project A's value is concentrated in the state handoff between rooms, which is the part the assignment
explicitly calls out as *die Herausforderung*. With a designer on the team, the atmospheric, narrative
character of an escape room is also something we can actually deliver rather than approximate.

## Decision

We build **Projekt A: Der digitale Escape Room**.

The game consists of up to four sequential rooms. Each room holds one puzzle. A room may only be
entered once every preceding room has been solved, and that rule is enforced by the backend, not by
the browser.

## Consequences

- The hard part of the project is the state handoff and the interface between rooms. That is where our
  architectural attention goes — see [ADR-0005](0005-shared-contract-package.md) and
  [ADR-0006](0006-server-authoritative-puzzles.md).
- Sub-teams split by room rather than by layer, so each person touches both frontend and backend for
  their room. [ADR-0007](0007-room-registry-and-ownership.md) makes that work without merge conflicts.
- Rooms are sequential, which means a broken room blocks everything behind it. Every room therefore
  needs to be demoable on its own, and we need a way to jump into a room during development.
- We do not build a highscore system. If we want a leaderboard for Friday's demo it is an addition, not
  a requirement.

## Alternatives considered

**Projekt B, the arcade platform.** More independent workstreams, so a single failure hurts less, and
the REST API is a cleaner teaching example. Rejected because five mini-games between three developers
means each game stays shallow, and the interesting architecture — one highscore endpoint — is a
smaller problem than sequential state handoff.
