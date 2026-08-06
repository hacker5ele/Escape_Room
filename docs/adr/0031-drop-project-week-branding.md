# ADR-0031: Drop the project-week branding, keep the assignment quotation

- **Status:** Accepted
- **Date:** 2026-08-04
- **Deciders:** Nepomuk Crhonek

## Context

The repository described itself as a school exercise in fifteen places: the page header a player
sees, the HTML meta description, the package description, the README, a Route 53 zone comment, and
the reasoning inside eight ADRs — *"not worth it in a five-day project week"*, *"forget about after
the project week"*, and so on.

That framing is useful internally and unhelpful anywhere a player, a search engine or a future reader
of the code encounters it. The app is a real deployment on a real domain; it should not introduce
itself as homework.

## Decision

Every mention of `KW 32`, `Projektwoche` and the English `project week` is removed or reworded —
**except inside the quoted assignment in CLAUDE.md**, which stays exactly as it was handed to us.

The reasoning in the ADRs is preserved rather than deleted, because it is the reasoning. *"Not worth
it in a five-day project week"* becomes *"not worth it in a five-day build"*: the constraint that
drove the decision is still there, without the label.

The visible header loses its eyebrow line entirely rather than gaining a replacement. There was
nothing to put there that a player needed.

### The assignment quotation is exempt

CLAUDE.md reproduces the assignment verbatim, in German, under an explicit rule: *"Do not translate,
reword, reformat or 'fix' it — it is a quotation and the source of truth for what we owe at the end
of the week."*

Those two remaining mentions — `Wochenprogramm KW 32` and `Ferien-Projektwoche` — are inside that
block. Editing them would make it no longer a quotation, and would quietly falsify the one document
recording what was actually asked for. A quotation that has been tidied is worth nothing as evidence.

So the rule wins over the tidy-up, and the block is untouched.

## Consequences

**Good**

- Nothing a player sees, and nothing a crawler indexes, describes the app as a school project.
- The ADRs keep their arguments; only the label is gone.
- The assignment is still recorded exactly as received.

**Bad**

- CLAUDE.md now says one thing in prose and the quotation says another. That is the correct way round
  — the quotation is evidence, the prose is ours — but it is worth knowing before somebody "fixes"
  it.

**Notable**

- The Route 53 zone comment changed. Confirmed in-place with `terraform plan`; a hosted zone that was
  replaced would be handed new nameservers and take the domain down with it.

## Alternatives considered

**Scrubbing the quotation too.** Fully consistent, and it destroys the only verbatim record of the
assignment. Rejected.

**Deleting the assignment block entirely.** Removes the mentions and the evidence together, leaving
nothing in the repository that says what the task actually was. Rejected.

**Leaving English "project week" in place.** It is the same idea in another language, and the point
was the framing rather than the specific string.
