import { z } from 'zod'

/**
 * The public face of a player.
 *
 * This is a *cache* of what the identity provider knows, refreshed whenever
 * somebody opens their game. It exists for three reasons that all need the same
 * data:
 *
 *   1. Adding a friend by username needs username → userId, and the identity
 *      provider is not a database we can index.
 *   2. Avatars appear in friend lists, chat and the leaderboard. Asking Clerk
 *      per render would be a network call per face on screen.
 *   3. Chat and notifications need a display name for someone who is not the
 *      person currently signed in.
 *
 * Deliberately contains no email address and nothing else Clerk holds. Anything
 * in here can end up in front of another player, so it holds only what a
 * player has already chosen to make public.
 */
export const publicProfileSchema = z.object({
  userId: z.string().min(1),
  /** Unique across the instance, enforced by Clerk. See ADR-0021. */
  username: z.string().min(1),
  displayName: z.string(),
  /**
   * Clerk's avatar URL, or null. It is a public `img.clerk.com` URL and accepts
   * a `?width=` parameter, so a list of faces need not download full-size
   * images — see `avatarUrl()` below.
   */
  imageUrl: z.string().nullable(),
})

export type PublicProfile = z.infer<typeof publicProfileSchema>

/**
 * Sizes an avatar at the source rather than in CSS.
 *
 * Clerk serves images through a resizing CDN, so a 32-pixel avatar in a friend
 * list should fetch 64 pixels for retina — not the original upload. Without
 * this a chat with twenty faces pulls twenty full-size photographs.
 */
export function avatarUrl(profile: Pick<PublicProfile, 'imageUrl'>, size: number): string | null {
  if (!profile.imageUrl) return null

  // Built by hand rather than with `URL`, which is not in this package's lib —
  // shared is compiled for both Node and the browser, and pulling in DOM types
  // to append one query parameter would be a poor trade.
  //
  // Doubled for retina displays, and capped so a caller cannot ask the CDN for
  // something absurd. Clerk's URLs carry no `width` of their own, so appending
  // is safe.
  const width = Math.min(Math.max(size, 1) * 2, 512)
  const separator = profile.imageUrl.includes('?') ? '&' : '?'
  return `${profile.imageUrl}${separator}width=${width}`
}

/**
 * The letters shown when somebody has no avatar.
 *
 * Falls back through display name, then username, then a neutral mark — never
 * empty, because an empty circle reads as a loading state that never resolves.
 */
export function initialsFor(profile: Pick<PublicProfile, 'displayName' | 'username'>): string {
  const source = profile.displayName.trim() || profile.username.trim()
  if (!source) return '?'

  const words = source.split(/\s+/).filter(Boolean)
  if (words.length >= 2) {
    return `${words[0]![0]}${words[1]![0]}`.toUpperCase()
  }
  return source.slice(0, 2).toUpperCase()
}

/** Usernames are matched case-insensitively; this is the form stored and queried. */
export function normalizeUsername(username: string): string {
  return username.trim().toLowerCase()
}
