# ADR-0011: The user decides, the agent does not

- **Status:** Accepted
- **Date:** 2026-08-03
- **Deciders:** Nepomuk Crhonek
- **Approved-by:** Nepomuk Crhonek, 2026-08-03

## Context

We use Claude to write code in this repository. An agent that is good at
producing plausible code is also good at producing plausible *decisions* — it
will pick a library, invent a data shape, or quietly widen an interface, and the
result compiles and passes tests, so nobody notices until the choice is load
bearing and expensive to undo.

That is a bad fit for this project in particular. The assignment makes
architecture a graded deliverable, requires interface changes to be agreed by
the whole team in advance, and gives us four people who each need to understand
why the system looks the way it does. A decision nobody made is a decision
nobody can explain on Friday.

## Decision

**Every decision belongs to a person. The agent executes decisions; it does not
make them.**

Concretely, Claude must stop and ask rather than choose, whenever it would:

- pick between libraries, frameworks or approaches;
- design or change a data model, an API shape, or anything in `packages/shared`;
- decide scope — what to build, what to leave out, how far to take something;
- resolve an ambiguity in a request by guessing what was meant.

When it stops, it presents the options and their consequences and waits.
Executing something already decided in an ADR is work. Choosing between two
options is a decision. If it is not clear which of the two is happening, it is a
decision, and the agent asks.

This rule is written at the top of `CLAUDE.md`, above every other rule, because
it governs how all the others get applied.

## Consequences

- Decisions stay traceable. Every architectural choice has a person's name on
  it and, through the ADR process, a written rationale.
- It is slower. The agent will interrupt with questions that a person might have
  been happy to let it answer, and some of those questions will feel obvious.
  That is the intended trade: obvious-looking choices are exactly the ones that
  get made badly and unnoticed.
- The team has to actually be available to answer. A question that sits
  unanswered blocks work, so decisions should be made in the stand-up where
  possible rather than one at a time during the day.
- It pairs with the ADR rule rather than duplicating it: this ADR says *who*
  decides, [ADR-0010](0010-git-workflow.md) says *how* the decision gets
  recorded and approved before code lands.

## Alternatives considered

**Let the agent decide anything reversible, escalate only the rest.** Faster,
and defensible on a long-lived codebase where a bad call can be refactored.
Rejected because "reversible" is a judgement call, and it is precisely the
judgement we do not want delegated — an agent that decides what counts as a
small decision has already been given the big one.

**No rule; review the diffs.** This is the normal way to work with a coding
assistant. Rejected for this week: review catches bad code reliably and silent
architectural drift much less reliably, and the drift is the thing that costs us
on Wednesday when four people integrate.
