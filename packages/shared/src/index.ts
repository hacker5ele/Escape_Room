/**
 * @escape-room/shared — the interface contract.
 *
 * Frontend and backend both import from here, so a breaking change fails the
 * typecheck on both sides at once instead of surfacing at runtime. That is the
 * whole point of the package. See ADR-0005.
 */
export * from './rooms.js'
export * from './session.js'
export * from './access.js'
export * from './api.js'
