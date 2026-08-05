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
// jsdom implements no layout, so it has no `ResizeObserver` either. Anything
// that sizes itself from the space it actually got needs one — the character
// figure is laid out in pixels from the rig, so it has to measure its stage
// rather than being told to fill it in CSS.
//
// Observes nothing and reports nothing: components keep whatever height they
// started with, which is the right default for a test with no layout to react
// to in the first place.
window.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
}

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
