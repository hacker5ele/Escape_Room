# ADR-0009: Containerize with multi-stage Docker images and compose

- **Status:** Accepted
- **Date:** 2026-08-03
- **Deciders:** Nepomuk Crhonek, Eleonora Vynogradova
- **Approved-by:** Nepomuk Crhonek, 2026-08-03

## Context

On Friday afternoon the project has to run live in front of the class, on a machine that is not
necessarily one of ours. "It works on my laptop" is not a demo. We also want a new team member — or
the rival team on Thursday — to be able to start the whole stack without installing our exact Node
version.

The monorepo complicates this: the lockfile and `packages/shared` live above each app, so an app
folder is not a self-sufficient build context.

## Decision

Each app gets a multi-stage Dockerfile, and `docker compose up --build` starts the whole stack.

**Build context is the repository root** for both images, with the Dockerfile path given explicitly.
This is required — `npm ci` needs the root lockfile and the workspace manifests. A root `.dockerignore`
keeps `node_modules`, `npm-cache/` and `.git` out of the context.

**Backend** — three stages on `node:22-alpine`:
1. *deps*: copy only the root manifests and each workspace's `package.json`, then `npm ci`. Because
   source is not copied yet, this layer is cached and only re-runs when dependencies actually change.
2. *build*: copy the sources, build `packages/shared`, then the backend.
3. *runtime*: production dependencies only, the compiled `dist/` folders, a non-root user, and a
   healthcheck on `/api/health`.

**Frontend** — build with Vite, then serve the static output from `nginx:alpine`. The nginx config does
two things: an SPA fallback so deep links into a room work on reload, and a proxy from `/api` to
`http://backend:3000`.

That proxy is the point. In development Vite proxies `/api`; in production nginx does. The frontend
bundle contains **no backend URL at all** and the browser only ever talks to one origin — so there is
no CORS configuration to get wrong at the worst possible moment on Friday.

## Consequences

- `docker compose up --build` is the whole setup instruction. The app is on `http://localhost:8080`.
- The runtime images contain no compiler, no dev dependencies and no source — smaller, and less to go
  wrong.
- Containers run as a non-root user. Cheap to do at bootstrap, awkward to retrofit.
- The `deps` layer caches, so a code change rebuilds in seconds rather than re-installing everything.
- The cost: Dockerfiles that reference paths outside their own folder are unusual to read, and someone
  running `docker build` from inside `apps/backend` will get a confusing failure. The build commands
  are in the README and in compose, and this ADR explains why.
- Anyone adding a workspace must add its `package.json` to the deps stage, or `npm ci` will fail
  inside Docker while working fine locally.

## Alternatives considered

**A single image running both apps.** Fewer moving parts, but it merges two deployment lifecycles and
means rebuilding the backend to change a colour.

**No containers, just `npm run dev` for the demo.** What most teams will do. Rejected because the
assignment asks for a clean, containerizable structure, and because a laptop that has to be woken up
mid-presentation is a bad look.

**`node:22-slim` (Debian) instead of Alpine.** Larger, but avoids musl issues with native modules. We
have no native dependencies today; if [ADR-0008](0008-session-persistence.md) lands on SQLite, this is
the line that has to change, and that ADR says so.
