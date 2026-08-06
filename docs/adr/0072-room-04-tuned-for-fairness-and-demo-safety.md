# ADR 0072: Room 4 tuned for fairness and demo safety

Status: Proposed
Date: 2026-08-06
Deciders: Abigail Romero

Context

Play testing found real problems. Guardians could start a chase from behind the player, out of
what the camera even showed. A capture sent the player all the way back to the start regardless
of progress. The countdown counted up with no effect on anything. Several models were far heavier
than the scene needed, a real risk for a live demo.

Decision

A guardian may only begin a chase if it is roughly ahead of the player, matching what the camera
already shows, and its range shrinks further if the player stands still or has just picked up the
alchemy power. Capture now returns the player to the last vision solved, not the room start. The
countdown became a real limit that pauses during every modal and resets the run to checkpoint on
expiry. Three of the five vision puzzles became genuine interactive mechanics, a bell pattern to
repeat, a spot the difference skyline, and a memory match, rather than more text riddles. Every
character and landscape model went through simplification and texture compression, cutting the
room total from about one hundred and six megabytes to about thirteen. Banishing the wizard now
plays a short cinematic where the player and the prize rise together in a burst of light, since
control passes to a shared file the instant the door itself is solved and this room cannot show
anything after that point.

Consequences

The room now depends on an extra camera mode and a handful of interactive puzzle components that
did not exist before, more surface area than plain questions had. Compression is one way. Source
models that get replaced later need recompressing by hand, the pipeline is not automatic.
