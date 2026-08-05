import { RIG, type Character, type Part, type RigPoint, type Slot, findPart, partUrl } from './parts'

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
 * The square is a portrait: the head, and just enough shoulder to sit on.
 *
 * An avatar renders at 32 pixels in a friend list. A whole standing figure at
 * that size is an unreadable smudge — the head alone would be about nine pixels
 * across — so the thing that identifies a player has to be the face.
 *
 * 260 is picked against the artwork rather than by eye: the widest head in the
 * catalogue is 218px and every head is 190 tall, so a 260 box holds the largest
 * of them with room to spare, and the torso arriving at the bottom edge gives
 * the head something to stand on instead of floating.
 */
const CROP = 260

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
    { slot: 'head', part: head, anchor: 'chin', mirror: false },
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

  // The window on the rig that the square shows. Centred horizontally on the
  // head, and vertically on the middle of the head rather than on the chin, so
  // the face lands in the middle of the circle every avatar is cropped to.
  const [chinX, chinY] = RIG.chin
  const headHeight = layers.find((layer) => layer.slot === 'head')?.part.h ?? CROP
  const offsetX = chinX - CROP / 2
  const offsetY = chinY - headHeight / 2 - CROP / 2

  layers.forEach((layer, position) => {
    const image = images[position]
    if (!image) return

    const [ax, ay] = RIG[layer.anchor]
    const [px, py] = layer.part.pivot
    const pivotX = layer.mirror ? layer.part.w - px : px

    const x = (ax - pivotX - offsetX) * scale
    const y = (ay - py - offsetY) * scale
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
