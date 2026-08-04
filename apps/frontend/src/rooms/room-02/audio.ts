/**
 * Sound effects for Room 2, played from real audio files (no synthesis).
 *
 * Files live under `apps/frontend/public/audio/room-02/`:
 *   click.mp3, success.mp3, static-burst.mp3, siren.mp3, ambient.mp3,
 *   growl.mp3, roar1.mp3, roar2.mp3, running.mp3, heavy-steps-dino.mp3,
 *   scratching-metal.mp3, recovered_audio_log.mp3
 *
 * There is no footstep.mp3 for the player, and no error sound for wrong
 * answers — both deliberately left out.
 *
 * Until a file exists, the browser will 404 on that one sound and play
 * nothing else — every other sound keeps working.
 */

const BASE = '/audio/room-02'

const FILES = {
  click: `${BASE}/click.mp3`,
  success: `${BASE}/success.mp3`,
  staticBurst: `${BASE}/static-burst.mp3`,
  siren: `${BASE}/siren.mp3`,
  ambient: `${BASE}/ambient.mp3`,
  growl: `${BASE}/growl.mp3`,
  roar1: `${BASE}/roar1.mp3`,
  roar2: `${BASE}/roar2.mp3`,
  running: `${BASE}/running.mp3`,
  heavySteps: `${BASE}/heavy-steps-dino.mp3`,
  scratchingMetal: `${BASE}/scratching-metal.mp3`,
  recordingLog: `${BASE}/recovered_audio_log.mp3`,
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

/** Used when the file's real duration can't be read (missing file, metadata never loads). */
const FALLBACK_DURATION = 14

/**
 * A one-shot sound that can be cut off early (the modal showing it gets closed
 * mid-playback). `start()` resolves with the clip's duration in seconds once
 * known, so callers can time other effects (subtitle reveals, static bursts)
 * against the real playback length.
 */
function createStoppable(src: string, volume: number) {
  let audio: HTMLAudioElement | null = null

  function start(): Promise<number> {
    audio?.pause()
    const el = new Audio(src)
    audio = el
    el.volume = muted ? 0 : volume
    return new Promise((resolve) => {
      let settled = false
      function settle(duration: number) {
        if (settled) return
        settled = true
        resolve(Number.isFinite(duration) && duration > 0 ? duration : FALLBACK_DURATION)
      }
      el.addEventListener('loadedmetadata', () => settle(el.duration), { once: true })
      el.addEventListener('error', () => settle(FALLBACK_DURATION), { once: true })
      setTimeout(() => settle(FALLBACK_DURATION), 1500)
      void el.play().catch(() => settle(FALLBACK_DURATION))
    })
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
const recordingLogSound = createStoppable(FILES.recordingLog, 0.65)

/** Alternates the two roar recordings so back-to-back scares don't repeat. */
function pickRoar(): string {
  return Math.random() < 0.5 ? FILES.roar1 : FILES.roar2
}

export const roomAudio = {
  click: () => playOnce(FILES.click, 0.5),
  success: () => playOnce(FILES.success, 0.6),
  staticBurst: () => playOnce(FILES.staticBurst, 0.4),

  /** The player sprinting for the exit, in the win ending sequence. */
  running: () => playOnce(FILES.running, 0.6),

  /** The creature's heavy footfalls and its claws on metal — presence cues, not a jump scare. */
  heavySteps: () => playOnce(FILES.heavySteps, 0.55),
  scratchingMetal: () => playOnce(FILES.scratchingMetal, 0.5),

  /** `scale` softens a jump-scare roar without needing a second recording. */
  roar: (scale = 1) => playOnce(pickRoar(), 0.8 * scale),
  /** The low ambient growl used for the distant, off-screen threat cue. */
  distantRoar: () => playOnce(FILES.growl, 0.8 * 0.3),

  startSirenLoop: () => sirenLoop.start(),
  stopSirenLoop: () => sirenLoop.stop(),

  startAmbient: () => ambientLoop.start(),
  stopAmbient: () => ambientLoop.stop(),

  startRecordingLog: () => recordingLogSound.start(),
  stopRecordingLog: () => recordingLogSound.stop(),

  setMuted(value: boolean) {
    muted = value
    sirenLoop.applyMute()
    ambientLoop.applyMute()
    recordingLogSound.applyMute()
  },
  isMuted: () => muted,
}
