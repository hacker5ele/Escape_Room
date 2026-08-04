import '@testing-library/jest-dom/vitest'

// jsdom implements no layout, so it has no `scrollIntoView` at all — calling it
// throws. Components that follow a growing list (the chat window) call it for
// good reason, so the gap is stubbed here rather than worked around in each
// component.
Element.prototype.scrollIntoView = () => undefined
