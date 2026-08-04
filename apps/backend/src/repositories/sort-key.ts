/**
 * The sort key used by every append-only, per-owner table — notifications and
 * messages today.
 *
 * `toISOString()` is fixed-width UTC to the millisecond, so it sorts
 * lexicographically in true chronological order. The id breaks ties between two
 * rows written in the same millisecond.
 */
export function sortKeyFor(createdAt: string, id: string): string {
  return `${createdAt}#${id}`
}
