# ADR 0071: Room 4 becomes a 3D chase runner

Status: Proposed
Date: 2026-08-05
Deciders: Abigail Romero

Context

Room 4 shipped with a placeholder puzzle only, six numbers to add together. This replaces the
frontend with a real 3D scene built on react three fiber, the only room using that stack. The
backend still checks the final answer and nothing about that contract changed.

Decision

The player walks a curved path through an open landscape, keyboard controlled, while three
independent guardians patrol and give chase if they spot the player ahead of them. Five hidden
visions, each tied to a landscape model, gate progress. Solving four unlocks the fifth, which
starts a finale where a wizard blocks the path until banished. The door puzzle at the end keeps
its mechanism, only its digits and the rule for combining them changed.

Consequences

A second rendering stack now sits inside an otherwise flat frontend, and its models add real
load weight. Coverage is manual and headless browser checks rather than unit tests, since the
gameplay lives in continuous animation frames rather than discrete state.

Alternatives considered

Four generic placeholder cubes were replaced by the supplied landscape models once it was clear
they could double as walkable ground, not just decoration. A hard failure state on capture was
rejected. No other room ends a run outright, so this one sends the player back to a checkpoint
instead.
