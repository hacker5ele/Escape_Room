import { LOCKS, STORY, type LockKind } from './story'

/** Same normalization the original lock input used: trim, lowercase, drop whitespace. */
export function normalizeLockInput(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, '')
}

export function isLockAnswerCorrect(kind: LockKind, input: string): boolean {
  return normalizeLockInput(input) === LOCKS[kind].answer
}

/** The evidence puzzle is a decision, not a code: pick exactly the damning documents. */
export function isEvidenceSelectionCorrect(selected: ReadonlySet<string>): boolean {
  const damningIds = STORY.evidenceItems.filter((item) => item.damning).map((item) => item.id)
  return selected.size === damningIds.length && damningIds.every((id) => selected.has(id))
}

export function shuffle<T>(items: readonly T[]): T[] {
  const copy = [...items]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

/** Darkens a hex color for a terminal's border, same as the original wire board. */
export function shadeColor(hex: string): string {
  const num = parseInt(hex.slice(1), 16)
  const r = Math.max(0, (num >> 16) - 40)
  const g = Math.max(0, ((num >> 8) & 0xff) - 40)
  const b = Math.max(0, (num & 0xff) - 40)
  return `rgb(${r},${g},${b})`
}
