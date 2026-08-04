/**
 * The one URL the app actually routes on.
 *
 * Everything else is a panel on the single page, so a router library would be
 * one dependency for one route. Deep links work because CloudFront rewrites
 * unknown paths to `index.html` — see the `spa_fallback` function in the
 * Terraform module.
 */
export function inviteTokenFromPath(pathname: string): string | null {
  const match = /^\/invite\/([A-Za-z0-9_-]{1,128})\/?$/.exec(pathname)
  return match ? match[1]! : null
}
