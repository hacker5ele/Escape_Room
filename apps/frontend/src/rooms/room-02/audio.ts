/**
 * Sound effects for Room 2, played from real audio files (no synthesis).
 *
 * Files are expected under `apps/frontend/public/audio/room-02/`. They are not
 * committed yet — drop these in, matching filenames, and playback works with
 * no code changes:
 *   click.mp3, success.mp3, error.mp3, static-burst.mp3, siren.mp3,
 *   footstep.mp3, roar.mp3, ambient.mp3
 *
 * Until a file exists, the browser will 404 on that one sound and play
 * nothing else — every other sound keeps working.
 */

const BASE = '/audio/room-02'

const FILES = {
  click: `${BASE}/click.mp3`,
  success: `${BASE}/success.mp3`,
  error: `${BASE}/error.mp3`,
  staticBurst: `${BASE}/static-burst.mp3`,
  siren: `${BASE}/siren.mp3`,
  footstep: `${BASE}/footstep.mp3`,
  roar: `${BASE}/roar.mp3`,
  ambient: `${BASE}/ambient.mp3`,
} as const

let muted = false

/** Fire-and-forget playback for a sound that can overlap itself (clicks, hits). */
function playOnce(src: string, volume: number) {
  if (muted) return
  const audio = new Audio(src)
  audio.volume = Math.min(1, Math.max(0, volume))
  void audio.play().catch(() => {
    // Autoplay was blocked (no user gesture yet, or the file is missing) — ignore.
  })
}

/** A persistent looping sound (siren, ambient hum) that can be started and stopped. */
function createLoop(src: string, volume: number) {
  let audio: HTMLAudioElement | null = null

  function start() {
    if (audio) return
    audio = new Audio(src)
    audio.loop = true
    audio.volume = muted ? 0 : volume
    void audio.play().catch(() => {})
  }

  function stop() {
    audio?.pause()
    audio = null
  }

  function applyMute() {
    if (audio) audio.volume = muted ? 0 : volume
  }

  return { start, stop, applyMute }
}

const sirenLoop = createLoop(FILES.siren, 0.35)
const ambientLoop = createLoop(FILES.ambient, 0.12)

export const roomAudio = {
  click: () => playOnce(FILES.click, 0.5),
  success: () => playOnce(FILES.success, 0.6),
  error: () => playOnce(FILES.error, 0.5),
  staticBurst: () => playOnce(FILES.staticBurst, 0.4),
  footstep: () => playOnce(FILES.footstep, 0.6),

  /** `scale` softens a distant roar without needing a second recording. */
  roar: (scale = 1) => playOnce(FILES.roar, 0.8 * scale),
  distantRoar: () => playOnce(FILES.roar, 0.8 * 0.3),

  startSirenLoop: () => sirenLoop.start(),
  stopSirenLoop: () => sirenLoop.stop(),

  startAmbient: () => ambientLoop.start(),
  stopAmbient: () => ambientLoop.stop(),

  setMuted(value: boolean) {
    muted = value
    sirenLoop.applyMute()
    ambientLoop.applyMute()
  },
  isMuted: () => muted,
}
