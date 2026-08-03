# ADR-0003: Frontend stack — React + Vite + TypeScript + Tailwind

- **Status:** Accepted
- **Date:** 2026-08-03
- **Deciders:** Abigail Romero, Inaam Ahmed, Eleonora Vynogradova, Nepomuk Crhonek
- **Approved-by:** Nepomuk Crhonek, 2026-08-03

## Context

The escape room is a browser application with four independently developed rooms, each with its own
interaction model and its own visual design coming out of Figma. We need fast feedback while building,
per-room code isolation, and a styling approach that three developers can use consistently without a
long shared-CSS argument on Wednesday.

## Decision

- **React 19** with function components and hooks.
- **Vite** as dev server and bundler, via `@vitejs/plugin-react`.
- **TypeScript** in strict mode. `any` is a code-review finding, not a shortcut.
- **React Router** for room navigation, with a guard component in front of each room route.
- **Tailwind CSS v4** through the `@tailwindcss/vite` plugin, with design tokens from Inaam's Figma
  file defined once in the Tailwind theme.
- **Vitest** with Testing Library for component tests.

Vite's dev server proxies `/api` to the backend on port 3000, so the frontend never contains a backend
URL. The same path works in production because nginx proxies `/api` too — see
[ADR-0009](0009-containerization.md).

## Consequences

- Hot module replacement makes room development fast, which matters when four rooms have to be built
  in three days.
- Each room is a lazily loaded route, so a room that fails to compile does not take the whole app down
  during development, and rooms are code-split in the production bundle.
- Tailwind means styling lives next to the markup. Three developers touching four different rooms will
  not collide in a shared stylesheet, and translating a Figma spacing or colour value is a token
  lookup rather than a new CSS class. The cost is verbose `className` strings and a learning curve for
  anyone who has not used utility CSS before — the tokens defined in the theme keep this manageable.
- Strict TypeScript plus the shared contract package means a backend change that breaks the frontend
  shows up as a compile error, not as a blank screen.

## Alternatives considered

**CSS Modules with hand-written design tokens.** No learning curve and total freedom for an
atmospheric design. Rejected in favour of Tailwind for speed: utility classes are quicker to write
under time pressure, and the team preferred them.

**Next.js.** Routing and build tooling out of the box, but server-side rendering buys us nothing here
— the app is a client-side game talking to a separate API — and it would blur the frontend/backend
split the assignment asks us to make explicit.

**Plain React without a router.** Rendering rooms from a state variable would work for four rooms, but
we lose deep links, which we need to demo an individual room on Friday.
