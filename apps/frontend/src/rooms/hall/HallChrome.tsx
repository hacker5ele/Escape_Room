import { useEffect, useRef, useState } from 'react'
import { play, type SoundName } from '../../audio/sfx'
import type { HallDetail } from './state'

/**
 * The hall's chrome, in comic-book grammar.
 *
 * The print pipeline already stops the *artwork* looking generated — it
 * posterises every piece to four inks and lays a halftone over it
 * (`docs/building-a-room.md` §5). What that cannot do is make a screen look
 * like a comic, because a comic is not a rendering style, it is a set of
 * layout conventions: caption boxes, lettered sound effects, hard key lines,
 * plates that do not quite line up.
 *
 * All of which is CSS, and none of which an image model can produce — which is
 * why the sound effects here are set in the app's own display face rather than
 * drawn. A generated "SPLOOOSH" is a coin flip on the spelling, and drawn type
 * cannot misregister.
 */

/** How long a lettered sound effect stays on screen. */
const SFX_MS = 900

interface Bang {
  key: number
  word: string
  /** Scattered so two in a row do not land on top of each other. */
  x: number
  y: number
  tilt: number
}

/** What the server's `flash` codes are shouted as. */
const WORDS: Record<string, string> = {
  glub: 'GLUB!',
  sploosh: 'SPLOOSH!',
  kachunk: 'KA-CHUNK!',
  clang: 'CLANG!',
  act: 'KRAKK!',
  lit: 'FWOOM!',
  seated: 'CHOCK!',
  recount: 'THE HALL RECOUNTS',
}

const NOISES: Record<string, SoundName> = {
  glub: 'bubble',
  sploosh: 'bubble',
  kachunk: 'slide',
  clang: 'stamp',
  act: 'fanfare',
  lit: 'pop',
  seated: 'click',
  recount: 'chime',
}

/**
 * Lettered sound effects, fired off the server's `flash` list.
 *
 * Deliberately not driven by local prediction: a KA-CHUNK means the server
 * spat a tablet back out, so it fires when that is true for everybody rather
 * than when this browser thought it might be.
 */
export function Bangs({ flash }: { flash: string[] }) {
  const [bangs, setBangs] = useState<Bang[]>([])
  const next = useRef(0)
  // Beats arrive twice a second and each carries the same array identity-wise
  // new; comparing the contents is what stops one event being shouted twice.
  const last = useRef('')

  useEffect(() => {
    const signature = flash.join('|')
    if (signature === last.current) return
    last.current = signature
    if (flash.length === 0) return

    const fresh: Bang[] = []
    for (const code of flash) {
      const kind = code.split(':')[0] ?? code
      const word = WORDS[kind]
      if (!word) continue

      next.current += 1
      const seed = next.current
      fresh.push({
        key: seed,
        word,
        // Scattered from a counter rather than at random, so a re-render never
        // moves a bang that is already on screen.
        x: 24 + ((seed * 37) % 52),
        y: 18 + ((seed * 23) % 46),
        tilt: ((seed * 17) % 13) - 6,
      })
      const noise = NOISES[kind]
      if (noise) play(noise)
    }

    if (fresh.length === 0) return
    setBangs((current) => [...current, ...fresh])

    const timer = window.setTimeout(() => {
      setBangs((current) => current.filter((bang) => !fresh.some((one) => one.key === bang.key)))
    }, SFX_MS)
    return () => window.clearTimeout(timer)
  }, [flash])

  return (
    <div className="hall-bangs" aria-hidden="true">
      {bangs.map((bang) => (
        <span
          key={bang.key}
          className="hall-bang"
          data-text={bang.word}
          style={{ left: `${bang.x}%`, top: `${bang.y}%`, rotate: `${bang.tilt}deg` }}
        >
          {bang.word}
        </span>
      ))}
    </div>
  )
}

/**
 * The narration box, top left, where a comic puts it.
 *
 * It reacts rather than instructs: what it says is derived from what the hall
 * is currently doing, so it is the room's own voice rather than a tutorial
 * sitting on top of it.
 */
export function Caption({
  act,
  counted,
  detail,
  depth,
}: {
  act: number
  counted: number
  detail: HallDetail
  depth: number
}) {
  return (
    <div className="hall-caption" data-piece="">
      <p className="hall-caption-line">{narrate(act, counted, detail)}</p>
      {depth > 78 && <p className="hall-caption-urgent">AND IT IS AT YOUR CHIN.</p>}
    </div>
  )
}

function narrate(act: number, counted: number, detail: HallDetail): string {
  const paired = counted >= 2

  if (act === 1) {
    if (!paired) return 'FIVE LAMPS. EACH BURNS SIXTEEN SECONDS. ALL FIVE AT ONCE, OR NOTHING.'
    return `THE HALL WAS WORKED BY A PAIR AND HAS NOT FORGOTTEN. TWO LAMPS, TWO OF YOU, TOGETHER. ${detail.pairsDone} OF ${detail.pairsNeeded}.`
  }

  if (act === 2) {
    if (!paired) return 'THE INDEX GOES BACK IN THE ORDER THE DEPTH STAFF GIVES IT. LEFT TO RIGHT.'
    return 'THE FLOOR HAS OPENED DOWN THE MIDDLE. WHAT YOU CARRY INTO IT, YOU LOSE.'
  }

  if (act === 3) {
    if (!paired)
      return `THE GEARBOX REMEMBERS A PATTERN. FOLLOW IT, OR IT SLIPS BACK. ${detail.step} OF ${detail.steps}.`
    return `THE PLAQUE AT YOUR END IS NOT FOR YOU. READ IT OUT. ${detail.step} OF ${detail.steps}.`
  }

  if (act === 4) {
    const done = Math.round(detail.wound * 100)
    if (!paired) return `THE SEA IS COMING IN THROUGH THE SLUICE. WIND IT SHUT — IT IS A LONG HOLD. ${done}%.`
    return `TWO WINCHES, AND IT ONLY MOVES WHILE BOTH ARE HELD. ${done}%.`
  }

  if (detail.keypadDrowned) return 'SIX FIGURES — AND THE DRUMS ARE UNDER WATER. GET IT DOWN FIRST.'
  return 'SIX FIGURES. THE DOOR IS THE LAST THING IN HERE STILL WORKING.'
}

/**
 * The water, as a thing you watch rather than a number you read.
 *
 * There is no countdown anywhere in this room. The gauge *is* the clock, which
 * is what lets the pressure run for eight minutes without turning into a timer
 * nagging in the corner.
 */
export function TideGauge({
  depth,
  trend,
  shut,
}: {
  depth: number
  trend: string
  /** The sluice is shut, so the sea comes in at half the rate. Worth saying. */
  shut: boolean
}) {
  const height = Math.min(100, Math.max(0, depth))

  return (
    <div className="hall-gauge" data-piece="" data-trend={trend} data-shut={shut ? '' : undefined}>
      <span className="hall-gauge-label">TIDE</span>
      <div className="hall-gauge-tube">
        <div className="hall-gauge-fill" style={{ height: `${height}%` }} />
        <span className="hall-gauge-danger" />
      </div>
      <span className="hall-gauge-trend">
        {trend === 'falling' ? '▼ FALLING' : trend === 'holding' ? '▼ EASING' : '▲ RISING'}
      </span>
      {shut && <span className="hall-gauge-shut">SLUICE SHUT</span>}
    </div>
  )
}

/** The figures earned so far, stamped up as each act falls. */
export function Fragments({ fragments }: { fragments: string[] }) {
  return (
    <div className="hall-fragments" data-piece="">
      <span className="hall-gauge-label">THE CODE</span>
      <p className="hall-figures">
        {[0, 1, 2].map((index) => (
          <span key={index} className="hall-figure" data-known={fragments[index] ? '' : undefined}>
            {fragments[index] ?? '··'}
          </span>
        ))}
      </p>
    </div>
  )
}
