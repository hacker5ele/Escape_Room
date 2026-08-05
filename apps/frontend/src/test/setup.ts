import '@testing-library/jest-dom/vitest'

// jsdom implements no layout, so it has no `scrollIntoView` at all — calling it
// throws. Components that follow a growing list (the chat window) call it for
// good reason, so the gap is stubbed here rather than worked around in each
// component.
Element.prototype.scrollIntoView = () => undefined

// Nor does jsdom implement `matchMedia`. Anything that respects a user
// preference has to ask for it — the character figure checks
// `prefers-reduced-motion` before it starts tracking the pointer — so without
// this every such component throws on mount.
//
// Reports "no preference", which is the right default: it means the tests
// exercise the animated path rather than the quiet one.
window.matchMedia = (query: string): MediaQueryList =>
  ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => false,
  }) as MediaQueryList
