import { useState } from 'react'
import { avatarUrl, initialsFor } from '@escape-room/shared'

/**
 * A person's face, wherever one appears.
 *
 * Used in friend lists, requests, chat and the leaderboard, so it has to behave
 * for people who have no photograph — which is most people, and everybody in
 * local development. The fallback is initials on a colour derived from their
 * identity, so the same person is always the same colour and a list of faces
 * stays scannable even with no images at all.
 */
export interface AvatarSubject {
  userId: string
  username: string
  displayName: string
  imageUrl: string | null
}

export function Avatar({
  subject,
  size = 32,
  className = '',
}: {
  subject: AvatarSubject
  size?: number
  className?: string
}) {
  // A broken image is worse than no image: it renders as a torn-page icon.
  // Falling back to initials on error covers a deleted or expired CDN object.
  const [failed, setFailed] = useState(false)

  const src = failed ? null : avatarUrl(subject, size)
  const dimension = { width: size, height: size }

  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full ${className}`}
      style={{ ...dimension, backgroundColor: src ? undefined : colourFor(subject.userId) }}
      title={subject.displayName || subject.username}
    >
      {src ? (
        <img
          src={src}
          alt=""
          width={size}
          height={size}
          loading="lazy"
          onError={() => setFailed(true)}
          className="h-full w-full object-cover"
        />
      ) : (
        <span
          aria-hidden="true"
          className="font-mono font-semibold text-stock-50 select-none"
          // Scaled to the circle rather than fixed, so one component works at
          // 24px in a list and 64px on a profile.
          style={{ fontSize: Math.max(10, Math.round(size * 0.4)) }}
        >
          {initialsFor(subject)}
        </span>
      )}
    </span>
  )
}

/**
 * A stable colour per person.
 *
 * Deterministic from the user id so somebody does not change colour between
 * screens or reloads.
 *
 * Every entry is something the two inks could actually produce (ADR-0032).
 * A press has one red and one cyan; it gets variety from tint density and
 * from overprinting, not from more inks. So these are ink A, ink B, and the
 * two of them crossed at different densities — which is why there is no
 * green, no purple and no yellow in the list. An arbitrary hue here would be
 * the one place in the app that could not have been printed.
 *
 * All eight clear 7:1 against the near-white used for the initials.
 */
const PALETTE = [
  '#c9331e', // ink A
  '#086495', // ink B
  '#0a2222', // A over B, both solid — the true overprint
  '#903729', // A solid over a 40% B tint
  '#0a577b', // a 40% A tint over solid B
  '#484c54', // both at 70%
  '#a02718', // ink A, dense
  '#064b70', // ink B, dense
]

function colourFor(userId: string): string {
  let hash = 0
  for (let i = 0; i < userId.length; i += 1) {
    hash = (hash * 31 + userId.charCodeAt(i)) | 0
  }
  return PALETTE[Math.abs(hash) % PALETTE.length]!
}
