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
          className="font-mono font-semibold text-vault-950 select-none"
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
 * screens or reloads. The palette is fixed and picked to stay legible against
 * the dark near-black text used for initials.
 */
const PALETTE = [
  '#f5a524',
  '#7dd3a0',
  '#8ab4f8',
  '#e879a6',
  '#c4a2f5',
  '#6fd0d6',
  '#f08c6a',
  '#b8d06a',
]

function colourFor(userId: string): string {
  let hash = 0
  for (let i = 0; i < userId.length; i += 1) {
    hash = (hash * 31 + userId.charCodeAt(i)) | 0
  }
  return PALETTE[Math.abs(hash) % PALETTE.length]!
}
