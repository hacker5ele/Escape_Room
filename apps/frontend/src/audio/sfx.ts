/**
 * Every sound in the game, synthesised.
 *
 * There are no audio files anywhere in this project and there deliberately are
 * not going to be. 1950s cartoon effects genuinely *are* swept oscillators — a
 * slide whistle is a sine with a pitch ramp, a boing is that ramp with a wobble
 * on it — so synthesising them is the honest reproduction rather than the cheap
 * substitute. It also means nothing to download, nothing to license, and every
 * sound tunable by changing a number.
 *
 * Two rules the browser imposes:
 *
 * **Nothing may be constructed before a gesture.** An `AudioContext` created on
 * page load starts suspended and, in Safari, stays that way. So the context is
 * built lazily on the first `play()` — which by construction happens inside a
 * click, because the first sound in the app is the Start button.
 *
 * **Autoplay can still be refused.** Every failure path here is silent: if
 * audio cannot start, the game works without it rather than throwing.
 */

export type SoundName =
  | 'click'
  | 'pop'
  | 'boing'
  | 'whoosh'
  | 'bubble'
  | 'chime'
  | 'countdown'
  | 'fanfare'
  | 'slide'
  | 'stamp'
  | 'heartbeat'
  | 'footstep'
  | 'ambient'
  | 'relief'
  | 'bell1'
  | 'bell2'
  | 'bell3'
  | 'bell4'
  | 'beat'
  | 'ascend'

const MUTE_KEY = 'escape-room:muted'

/** Enough for a party emoting at once; beyond this it is noise, not sound. */
const MAX_VOICES = 6

let context: AudioContext | null = null
let master: GainNode | null = null
let voices = 0
let muted = readMuted()

function readMuted(): boolean {
  try {
    return window.localStorage.getItem(MUTE_KEY) === '1'
  } catch {
    // Private-mode Safari. Defaulting to audible is the friendlier guess.
    return false
  }
}

export function isMuted(): boolean {
  return muted
}

export function setMuted(next: boolean): void {
  muted = next
  try {
    window.localStorage.setItem(MUTE_KEY, next ? '1' : '0')
  } catch {
    // Not fatal — the preference just will not survive a reload.
  }
  if (master && context) {
    master.gain.setTargetAtTime(next ? 0 : 0.9, context.currentTime, 0.01)
  }
}

/**
 * The context, built on first use.
 *
 * Returns null when audio is unavailable or refused, and every caller treats
 * that as "play nothing" rather than as an error.
 */
function ensure(): AudioContext | null {
  if (context) {
    // Safari suspends the context when a tab is backgrounded and does not
    // resume it on return, so this is checked every time rather than once.
    if (context.state === 'suspended') void context.resume().catch(() => undefined)
    return context
  }

  try {
    context = new AudioContext()
    master = context.createGain()
    master.gain.value = muted ? 0 : 0.9
    master.connect(context.destination)
    return context
  } catch {
    return null
  }
}

/** Called from the first user gesture so later sounds are not the first thing tried. */
export function unlockAudio(): void {
  ensure()
}

function voice(ctx: AudioContext, duration: number): GainNode | null {
  if (voices >= MAX_VOICES) return null
  voices += 1
  window.setTimeout(() => {
    voices -= 1
  }, duration * 1000)

  const gain = ctx.createGain()
  gain.connect(master!)
  return gain
}

/** A tone with an envelope. `sweep` gives the pitch ramp that makes it cartoon. */
function tone(
  ctx: AudioContext,
  out: GainNode,
  options: {
    type?: OscillatorType
    from: number
    to?: number
    at?: number
    duration: number
    volume?: number
  },
): void {
  const start = ctx.currentTime + (options.at ?? 0)
  const osc = ctx.createOscillator()
  const env = ctx.createGain()

  osc.type = options.type ?? 'sine'
  osc.frequency.setValueAtTime(options.from, start)
  if (options.to !== undefined) {
    // Exponential rather than linear: pitch is perceived logarithmically, so a
    // linear ramp sounds like it slows down at the top.
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, options.to), start + options.duration)
  }

  const peak = options.volume ?? 0.3
  env.gain.setValueAtTime(0, start)
  env.gain.linearRampToValueAtTime(peak, start + 0.008)
  env.gain.exponentialRampToValueAtTime(0.0001, start + options.duration)

  osc.connect(env)
  env.connect(out)
  osc.start(start)
  osc.stop(start + options.duration + 0.02)
}

/** Filtered white noise — every impact, whoosh and stamp is built from this. */
function noise(
  ctx: AudioContext,
  out: GainNode,
  options: {
    duration: number
    from: number
    to?: number
    q?: number
    at?: number
    volume?: number
  },
): void {
  const start = ctx.currentTime + (options.at ?? 0)
  const frames = Math.max(1, Math.floor(ctx.sampleRate * options.duration))
  const buffer = ctx.createBuffer(1, frames, ctx.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < frames; i += 1) data[i] = Math.random() * 2 - 1

  const source = ctx.createBufferSource()
  source.buffer = buffer

  const filter = ctx.createBiquadFilter()
  filter.type = 'bandpass'
  filter.Q.value = options.q ?? 1
  filter.frequency.setValueAtTime(options.from, start)
  if (options.to !== undefined) {
    filter.frequency.exponentialRampToValueAtTime(Math.max(1, options.to), start + options.duration)
  }

  const env = ctx.createGain()
  env.gain.setValueAtTime(options.volume ?? 0.25, start)
  env.gain.exponentialRampToValueAtTime(0.0001, start + options.duration)

  source.connect(filter)
  filter.connect(env)
  env.connect(out)
  source.start(start)
}

const RECIPES: Record<SoundName, (ctx: AudioContext, out: GainNode) => void> = {
  /** A blip. Deliberately tiny — it is under every button in the app. */
  click: (ctx, out) => tone(ctx, out, { type: 'square', from: 900, to: 700, duration: 0.05, volume: 0.14 }),

  pop: (ctx, out) => tone(ctx, out, { from: 420, to: 1200, duration: 0.11, volume: 0.26 }),

  /** The landing sound. A falling sweep with a wobble is exactly a cartoon boing. */
  boing: (ctx, out) => {
    tone(ctx, out, { from: 620, to: 150, duration: 0.3, volume: 0.3 })
    tone(ctx, out, { from: 300, to: 190, at: 0.06, duration: 0.2, volume: 0.16 })
    tone(ctx, out, { from: 210, to: 250, at: 0.16, duration: 0.14, volume: 0.1 })
  },

  /** Under the ink flood. Noise sweeping down reads as something rushing past. */
  whoosh: (ctx, out) => {
    noise(ctx, out, { duration: 0.5, from: 2400, to: 260, q: 0.8, volume: 0.22 })
    tone(ctx, out, { from: 700, to: 120, duration: 0.5, volume: 0.08 })
  },

  /** One bubble of the flood. Pitched randomly so a hundred do not sound like one. */
  bubble: (ctx, out) => {
    const base = 280 + Math.random() * 520
    tone(ctx, out, { from: base, to: base * 2.4, duration: 0.09, volume: 0.12 })
  },

  /** Ready. A rising major third — the shortest phrase that sounds like approval. */
  chime: (ctx, out) => {
    tone(ctx, out, { from: 660, duration: 0.16, volume: 0.2 })
    tone(ctx, out, { from: 990, at: 0.09, duration: 0.24, volume: 0.2 })
  },

  /** One tick of 3·2·1. The last one is `fanfare`, not this. */
  countdown: (ctx, out) => {
    tone(ctx, out, { type: 'triangle', from: 520, duration: 0.16, volume: 0.26 })
    noise(ctx, out, { duration: 0.08, from: 1800, to: 700, volume: 0.1 })
  },

  /** Go. Four notes up the major triad, brass-ish via sawtooth. */
  fanfare: (ctx, out) => {
    const notes = [523, 659, 784, 1047]
    notes.forEach((frequency, index) => {
      tone(ctx, out, {
        type: 'sawtooth',
        from: frequency,
        at: index * 0.085,
        duration: index === notes.length - 1 ? 0.5 : 0.16,
        volume: 0.16,
      })
    })
  },

  /** The slide whistle. One sine, one long ramp — that really is all it is. */
  slide: (ctx, out) => tone(ctx, out, { from: 1500, to: 320, duration: 0.42, volume: 0.2 }),

  /** A rubber stamp: the smack of the impact, then the thud of the desk. */
  stamp: (ctx, out) => {
    noise(ctx, out, { duration: 0.07, from: 3200, to: 900, q: 0.7, volume: 0.3 })
    tone(ctx, out, { type: 'triangle', from: 180, to: 60, duration: 0.14, volume: 0.28 })
  },

  /** One pulse of a chase's heartbeat: a deep thump with no ring to it. */
  heartbeat: (ctx, out) => {
    tone(ctx, out, { type: 'sine', from: 90, to: 42, duration: 0.16, volume: 0.32 })
    noise(ctx, out, { duration: 0.05, from: 220, to: 90, q: 1.4, volume: 0.12 })
  },

  /** One footfall: a soft low tap, quiet enough to sit under everything else. */
  footstep: (ctx, out) => {
    tone(ctx, out, { type: 'sine', from: 140, to: 90, duration: 0.08, volume: 0.09 })
    noise(ctx, out, { duration: 0.04, from: 300, to: 150, q: 1.2, volume: 0.05 })
  },

  /** A breath of the empty city: a low swell with a thin wind of noise on it. */
  ambient: (ctx, out) => {
    tone(ctx, out, { type: 'sine', from: 58, to: 48, duration: 2.4, volume: 0.05 })
    noise(ctx, out, { duration: 2.1, from: 420, to: 180, q: 0.5, volume: 0.03 })
  },

  /** The exhale after a close call: a soft downward sigh, nothing sharp about it. */
  relief: (ctx, out) => {
    tone(ctx, out, { type: 'sine', from: 340, to: 200, duration: 0.5, volume: 0.16 })
    noise(ctx, out, { duration: 0.35, from: 900, to: 300, q: 0.6, volume: 0.08 })
  },

  /** Four bell tones, one per step of the monastery's pattern puzzle. */
  bell1: (ctx, out) => tone(ctx, out, { type: 'sine', from: 523, duration: 0.32, volume: 0.22 }),
  bell2: (ctx, out) => tone(ctx, out, { type: 'sine', from: 659, duration: 0.32, volume: 0.22 }),
  bell3: (ctx, out) => tone(ctx, out, { type: 'sine', from: 784, duration: 0.32, volume: 0.22 }),
  bell4: (ctx, out) => tone(ctx, out, { type: 'sine', from: 988, duration: 0.32, volume: 0.22 }),

  /** One pulse of the run's driving beat: a punchy low kick with a click on top. */
  beat: (ctx, out) => {
    tone(ctx, out, { type: 'sine', from: 130, to: 55, duration: 0.13, volume: 0.18 })
    noise(ctx, out, { duration: 0.03, from: 1200, to: 400, q: 1, volume: 0.08 })
  },

  /** The rise: a triumphant sweep upward, for the moment the wizard is banished. */
  ascend: (ctx, out) => {
    tone(ctx, out, { type: 'sine', from: 220, to: 880, duration: 2.2, volume: 0.22 })
    tone(ctx, out, { type: 'triangle', from: 330, to: 1320, at: 0.2, duration: 2.0, volume: 0.14 })
    noise(ctx, out, { duration: 1.8, from: 300, to: 3000, q: 0.4, volume: 0.08 })
  },
}

/** Plays a sound. Silent and never throwing when audio is muted or refused. */
export function play(name: SoundName): void {
  if (muted) return

  const ctx = ensure()
  if (!ctx || !master) return

  const out = voice(ctx, 0.6)
  if (!out) return

  try {
    RECIPES[name](ctx, out)
  } catch {
    // A refused or closed context. Nothing here is worth breaking a click over.
  }
}
