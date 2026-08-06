import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PNG } from 'pngjs'

/**
 * Drawing a player's character, on a server with no canvas.
 *
 * The browser does this too, in `apps/frontend/src/character/compose.ts`, and
 * the two are the same arrangement of the same six layers around the same rig.
 * They are not the same code, and that is worth being honest about: this side
 * has no `drawImage`, so it composites by hand. What keeps them from drifting is
 * that **both read a manifest written by one run of
 * `scripts/characters/process_all.py`** — every number in it is a measurement of
 * the finished artwork rather than something typed twice.
 *
 * `pngjs` rather than `sharp`. Sharp is the obvious choice and the wrong one
 * here: the image is `node:22-alpine`, sharp on musl is a fight, and all this
 * needs is alpha-over blending of four flat pictures.
 */

const ASSETS = join(dirname(fileURLToPath(import.meta.url)), '../../assets')

interface Part {
  id: string
  w: number
  h: number
  pivot: [number, number]
}

interface Manifest {
  frame: [number, number]
  rig: Record<string, [number, number]>
  slots: Record<Slot, Part[]>
}

export type Slot = 'head' | 'body' | 'arm' | 'leg'

export interface CharacterParts {
  head: string
  body: string
  arm: string
  leg: string
}

/**
 * The order the six layers are drawn in, and what each hangs from.
 *
 * The far limb first so the near one overlaps it, and the head last but one so
 * it covers the join where the vest's neck hole would otherwise show the
 * background through — which is why `chin` sits below `neck` rather than on it.
 */
const PLACEMENTS: { slot: Slot; anchor: string; mirror: boolean }[] = [
  { slot: 'leg', anchor: 'hipR', mirror: true },
  { slot: 'leg', anchor: 'hipL', mirror: false },
  { slot: 'arm', anchor: 'shoulderR', mirror: true },
  { slot: 'body', anchor: 'neck', mirror: false },
  { slot: 'head', anchor: 'chin', mirror: false },
  { slot: 'arm', anchor: 'shoulderL', mirror: false },
]

let manifest: Manifest | null = null
const cache = new Map<string, PNG>()

async function catalogue(): Promise<Manifest> {
  manifest ??= JSON.parse(
    await readFile(join(ASSETS, 'characters/manifest.json'), 'utf8'),
  ) as Manifest
  return manifest
}

/**
 * A decoded part, kept.
 *
 * Eighty small images, decoded at most once each for the life of the process.
 * An invitation is rare and a decode is not free; re-reading the same eight
 * colours off disk every time would be the kind of waste that only shows up
 * under load.
 */
async function layer(path: string): Promise<PNG> {
  const held = cache.get(path)
  if (held) return held

  const decoded = PNG.sync.read(await readFile(join(ASSETS, path)))
  cache.set(path, decoded)
  return decoded
}

/** Nearest-neighbour would alias the halftone into moiré; this is a box filter. */
function resized(source: PNG, width: number, height: number): PNG {
  const out = new PNG({ width, height })
  const xRatio = source.width / width
  const yRatio = source.height / height

  for (let y = 0; y < height; y += 1) {
    const y0 = Math.floor(y * yRatio)
    const y1 = Math.min(source.height, Math.max(y0 + 1, Math.floor((y + 1) * yRatio)))

    for (let x = 0; x < width; x += 1) {
      const x0 = Math.floor(x * xRatio)
      const x1 = Math.min(source.width, Math.max(x0 + 1, Math.floor((x + 1) * xRatio)))

      let r = 0
      let g = 0
      let b = 0
      let a = 0
      let n = 0

      for (let sy = y0; sy < y1; sy += 1) {
        for (let sx = x0; sx < x1; sx += 1) {
          const i = (source.width * sy + sx) << 2
          const alpha = source.data[i + 3] ?? 0
          // Weighted by alpha, so a transparent pixel's colour — which is
          // arbitrary — does not bleed into the edge of the artwork.
          r += (source.data[i] ?? 0) * alpha
          g += (source.data[i + 1] ?? 0) * alpha
          b += (source.data[i + 2] ?? 0) * alpha
          a += alpha
          n += 1
        }
      }

      const j = (width * y + x) << 2
      out.data[j] = a > 0 ? Math.round(r / a) : 0
      out.data[j + 1] = a > 0 ? Math.round(g / a) : 0
      out.data[j + 2] = a > 0 ? Math.round(b / a) : 0
      out.data[j + 3] = n > 0 ? Math.round(a / n) : 0
    }
  }

  return out
}

function mirrored(source: PNG): PNG {
  const out = new PNG({ width: source.width, height: source.height })
  for (let y = 0; y < source.height; y += 1) {
    for (let x = 0; x < source.width; x += 1) {
      const from = (source.width * y + (source.width - 1 - x)) << 2
      const to = (source.width * y + x) << 2
      out.data[to] = source.data[from] ?? 0
      out.data[to + 1] = source.data[from + 1] ?? 0
      out.data[to + 2] = source.data[from + 2] ?? 0
      out.data[to + 3] = source.data[from + 3] ?? 0
    }
  }
  return out
}

/** Source-over, the one blend this needs. */
function over(base: PNG, top: PNG, atX: number, atY: number): void {
  for (let y = 0; y < top.height; y += 1) {
    const by = atY + y
    if (by < 0 || by >= base.height) continue

    for (let x = 0; x < top.width; x += 1) {
      const bx = atX + x
      if (bx < 0 || bx >= base.width) continue

      const s = (top.width * y + x) << 2
      const alpha = (top.data[s + 3] ?? 0) / 255
      if (alpha === 0) continue

      const d = (base.width * by + bx) << 2
      const under = (base.data[d + 3] ?? 0) / 255
      const out = alpha + under * (1 - alpha)
      if (out === 0) continue

      for (let channel = 0; channel < 3; channel += 1) {
        const sc = top.data[s + channel] ?? 0
        const dc = base.data[d + channel] ?? 0
        base.data[d + channel] = Math.round((sc * alpha + dc * under * (1 - alpha)) / out)
      }
      base.data[d + 3] = Math.round(out * 255)
    }
  }
}

/** Flattened onto the colour it will sit on — an alpha PNG is handled unevenly by mail clients. */
function onGround(image: PNG, ground: [number, number, number]): PNG {
  const sheet = new PNG({ width: image.width, height: image.height })
  for (let i = 0; i < sheet.data.length; i += 4) {
    sheet.data[i] = ground[0]
    sheet.data[i + 1] = ground[1]
    sheet.data[i + 2] = ground[2]
    sheet.data[i + 3] = 255
  }
  over(sheet, image, 0, 0)
  return sheet
}

/**
 * The whole standing figure, at the width asked for.
 *
 * A figure rather than the head-and-shoulders crop the app uses as an avatar,
 * and not only because an email has room for one: the portrait is a 260-unit
 * window blown up to 512, so it is upscaled about twice before anything else
 * touches it. The full figure is drawn at the size the artwork already is.
 */
export async function composeFigure(character: CharacterParts, width: number): Promise<PNG | null> {
  const { frame, rig, slots } = await catalogue()
  const scale = width / frame[0]
  const canvas = new PNG({ width, height: Math.round(frame[1] * scale) })

  for (const { slot, anchor, mirror } of PLACEMENTS) {
    const part = slots[slot]?.find((entry) => entry.id === character[slot])
    const at = rig[anchor]
    // A character naming a part that no longer exists is a character we cannot
    // draw. Better no picture than a figure missing a leg.
    if (!part || !at) return null

    const source = await layer(`characters/${slot}/${part.id}.png`)
    const drawn = resized(
      mirror ? mirrored(source) : source,
      Math.max(1, Math.round(part.w * scale)),
      Math.max(1, Math.round(part.h * scale)),
    )

    const pivotX = mirror ? part.w - part.pivot[0] : part.pivot[0]
    over(
      canvas,
      drawn,
      Math.round((at[0] - pivotX) * scale),
      Math.round((at[1] - part.pivot[1]) * scale),
    )
  }

  return canvas
}

/**
 * The character on a starburst, as one picture.
 *
 * Composited here rather than layered in the email, because overlapping two
 * images with a negative margin is a browser trick and Outlook lays email out
 * with Word. One picture is one thing a mail client cannot get wrong.
 */
export async function composeInviteHero(
  character: CharacterParts,
  width: number,
  ground: [number, number, number],
): Promise<Buffer | null> {
  const burst = await layer('email/burst.png')
  const figure = await composeFigure(character, Math.round(width * 0.55))
  if (!figure) return null

  const scaledBurst = resized(burst, width, Math.round((width * burst.height) / burst.width))

  // Sized against the burst's readable centre rather than its full extent — the
  // spikes reach the edges, so a figure scaled to the whole width stands on top
  // of them instead of inside them.
  const top = Math.round((scaledBurst.height - figure.height) / 2 + scaledBurst.height * 0.01)
  const canvas = new PNG({
    width,
    height: Math.max(scaledBurst.height, top + figure.height),
  })

  over(canvas, scaledBurst, 0, 0)
  over(canvas, figure, Math.round((width - figure.width) / 2), top)

  return PNG.sync.write(onGround(canvas, ground))
}
