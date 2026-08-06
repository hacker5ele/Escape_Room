/**
 * The dances.
 *
 * An emote costs no artwork at all. The character is six sprites hung on a rig
 * whose limbs already rotate about real joints (ADR-0033), so an emote is a set
 * of keyframes on parts that exist — nothing is generated, nothing is
 * downloaded, and a new one is a block of CSS.
 *
 * Each is chosen to read **in silhouette**, because that is what survives being
 * four inches tall on a projector in a bright classroom on Friday.
 *
 * The animation itself lives in `index.css` under `[data-emote]`. This file is
 * the catalogue and the timings, so the client knows when to stop.
 */

export const EMOTES = [
  { id: 'wave', label: 'Wave', ms: 1600, sound: 'pop' },
  { id: 'dance', label: 'Dance', ms: 3200, sound: 'boing' },
  { id: 'jump', label: 'Jump', ms: 900, sound: 'boing' },
  { id: 'spin', label: 'Spin', ms: 1200, sound: 'slide' },
  { id: 'cheer', label: 'Cheer', ms: 1800, sound: 'chime' },
  { id: 'shrug', label: 'Shrug', ms: 1400, sound: 'pop' },
  { id: 'sit', label: 'Sit', ms: 2400, sound: 'pop' },
  { id: 'faint', label: 'Faint', ms: 2600, sound: 'slide' },
] as const

export type EmoteName = (typeof EMOTES)[number]['id']

const BY_ID = new Map(EMOTES.map((emote) => [emote.id, emote]))

export function emoteDuration(name: EmoteName): number {
  return BY_ID.get(name)?.ms ?? 1500
}

export function emoteSound(name: EmoteName): string {
  return BY_ID.get(name)?.sound ?? 'pop'
}

export function isEmoteName(value: unknown): value is EmoteName {
  return typeof value === 'string' && BY_ID.has(value as EmoteName)
}

/**
 * How long a player must wait between emotes.
 *
 * Long enough that the button cannot be mashed into a strobe, short enough that
 * a conversation in dances still feels like one. The server enforces its own
 * limit as well — this is the courteous half, not the safe half.
 */
export const EMOTE_COOLDOWN_MS = 700
