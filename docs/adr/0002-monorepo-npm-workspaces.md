# ADR-0002: Use a monorepo with npm workspaces

- **Status:** Accepted
- **Date:** 2026-08-03
- **Deciders:** Abigail Romero, Nepomuk Crhonek, Eleonora Vynogradova
- **Approved-by:** Nepomuk Crhonek, 2026-08-03

## Context

Frontend and backend share a data model: the session, the room ids, and the shape of every request and
response. The assignment's *Schnittstellen-Vertrag* rule says changes to those structures must be
agreed with the whole team first — which is only meaningful if there is one place where they live.

With separate repositories, or with the types copy-pasted into both apps, a change on one side stays
invisible to the other until something breaks at runtime, probably on Thursday while the other team is
hammering the app. We want a contract change to break the *build*, loudly and immediately.

## Decision

One repository, three npm workspaces:

```
apps/frontend       — the React application
apps/backend        — the Express API
packages/shared     — @escape-room/shared, the contract both import
```

Workspaces are declared in the root `package.json`. A single `npm install` at the root installs
everything, and `packages/shared` is linked into both apps rather than published anywhere.

We use plain npm workspaces — no pnpm, no Turborepo, no Nx. Node 22 and npm 10 are already installed
on every machine, and a build orchestrator would be one more thing to debug during a five-day week.

## Consequences

- A change to the contract fails `npm run typecheck` in both apps at once. That is the point.
- One `npm install`, one lockfile, one CI run. Pull requests can span frontend and backend, which
  matters because rooms are vertical slices touching both.
- `packages/shared` must be **built before** the apps can use it, because the Node backend cannot
  import raw TypeScript at runtime. The root `dev` script runs the shared package in watch mode, and
  `build` runs shared first. Anyone who runs `npm run dev -w apps/backend` directly without a built
  shared package will get a confusing module-not-found error — the root scripts exist to prevent that.
- Docker builds need the repository root as their build context, not the app folder, because the
  lockfile and the shared package live above the app. The Dockerfiles are written accordingly; see
  [ADR-0009](0009-containerization.md).

## Alternatives considered

**Two separate repositories.** Cleaner deployment story, but the shared types would have to be
duplicated or published to a registry. Duplication is exactly the failure mode the assignment warns
about; publishing a package is far too much ceremony for one week.

**One repository, no workspaces — just folders.** Simpler on day one, but then the shared types are
imported through relative paths like `../../../shared/types`, which breaks as soon as either app is
built or containerized independently.

**pnpm workspaces or Turborepo.** Faster installs and better caching, genuinely nicer at scale. Not
worth introducing a tool nobody on the team has used when the whole project is five days long.
