import { FRAME, RIG, type Character, type Part, type RigPoint, type Slot, findPart, partUrl } from './parts'

/**
 * Flatten the character into one square image, for use as a profile picture.
 *
 * The animated figure is what you see while choosing; this is what everyone
 * else sees. Once Clerk holds it, it reaches friend lists, chat, the
 * leaderboard and Clerk's own account menu without any of them knowing that
 * characters exist (ADR-0033).
 */

/** Profile pictures are square, and this is what Clerk resizes from. */
const SIZE = 512

/**
 * How much of the figure goes in the square.
 *
 * Head and shoulders rather than the whole body. An avatar is rendered at 32
 * pixels in a friend list, and a full standing figure at that size is an
 * unreadable smudge — the head alone would be about nine pixels tall. Cropping
 * to the top of the frame keeps the face legible and still shows the body and
 * arms; only the legs are lost, and they are visible everywhere the character
 * is shown at a size where legs can be seen at all.
 */
const CROP = FRAME[0]

interface Placement {
  slot: Slot
  part: Part
  anchor: RigPoint
  mirror: boolean
}

function placements(character: Character): Placement[] | null {
  const head = findPart('head', character.head)
  const body = findPart('body', character.body)
  const arm = findPart('arm', character.arm)
  const leg = findPart('leg', character.leg)
  if (!head || !body || !arm || !leg) return null

  return [
    { slot: 'leg', part: leg, anchor: 'hipR', mirror: true },
    { slot: 'leg', part: leg, anchor: 'hipL', mirror: false },
    { slot: 'arm', part: arm, anchor: 'shoulderR', mirror: true },
    { slot: 'body', part: body, anchor: 'neck', mirror: false },
    { slot: 'head', part: head, anchor: 'neck', mirror: false },
    { slot: 'arm', part: arm, anchor: 'shoulderL', mirror: false },
  ]
}

function load(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error(`Could not load ${src}`))
    image.src = src
  })
}

/**
 * Draw the character and hand back a PNG.
 *
 * PNG rather than JPEG because the art is eight flat colours with hard edges —
 * exactly what JPEG is worst at, and it would ring around every outline.
 */
export async function composeCharacter(character: Character): Promise<Blob> {
  const layers = placements(character)
  if (!layers) throw new Error('That character refers to parts that no longer exist.')

  const images = await Promise.all(layers.map((layer) => load(partUrl(layer.slot, layer.part.id))))

  const canvas = document.createElement('canvas')
  canvas.width = SIZE
  canvas.height = SIZE
  const context = canvas.getContext('2d')
  if (!context) throw new Error('This browser could not draw your character.')

  const scale = SIZE / CROP
  context.imageSmoothingQuality = 'high'

  layers.forEach((layer, position) => {
    const image = images[position]
    if (!image) return

    const [ax, ay] = RIG[layer.anchor]
    const [px, py] = layer.part.pivot
    const pivotX = layer.mirror ? layer.part.w - px : px

    const x = (ax - pivotX) * scale
    const y = (ay - py) * scale
    const w = layer.part.w * scale
    const h = layer.part.h * scale

    if (layer.mirror) {
      // Flip about the drawing's own vertical centre — the same reflection the
      // figure does in CSS, which is what moves the pivot from px to w - px.
      context.save()
      context.translate(x + w, y)
      context.scale(-1, 1)
      context.drawImage(image, 0, 0, w, h)
      context.restore()
    } else {
      context.drawImage(image, x, y, w, h)
    }
  })

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Could not save your character.'))),
      'image/png',
    )
  })
}

/** The same picture as a data URL, for development where there is no Clerk to upload to. */
export async function composeCharacterDataUrl(character: Character): Promise<string> {
  const blob = await composeCharacter(character)
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('Could not read your character.'))
    reader.readAsDataURL(blob)
  })
}
