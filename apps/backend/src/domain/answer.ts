/**
 * Helpers for reading whatever the client sent as an answer.
 *
 * Both return null when the value is not usable, so a room's `check()` can
 * bail out early instead of trusting the shape.
 */

/** Trimmed, upper-cased, inner whitespace collapsed. Null for non-strings. */
export function asText(answer: unknown): string | null {
  if (typeof answer !== 'string') return null
  const normalized = answer.trim().replace(/\s+/g, ' ').toUpperCase()
  return normalized.length > 0 ? normalized : null
}

/** Accepts a number or a numeric string. Null for anything else, including NaN and Infinity. */
export function asNumber(answer: unknown): number | null {
  if (typeof answer === 'number') return Number.isFinite(answer) ? answer : null
  if (typeof answer !== 'string') return null
  const trimmed = answer.trim()
  if (trimmed === '') return null
  const parsed = Number(trimmed)
  return Number.isFinite(parsed) ? parsed : null
}
