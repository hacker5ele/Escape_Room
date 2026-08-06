import { describe, expect, it } from 'vitest'
import { PNG } from 'pngjs'
import { composeFigure, composeInviteHero } from './compose.js'

/**
 * Drawing a character without a canvas.
 *
 * The browser draws the same six layers around the same rig in
 * `apps/frontend/src/character/compose.ts`. What stops the two drifting is that
 * both read a manifest written by one run of the asset pipeline — so these
 * tests are about this side holding up its end: the right size, the right
 * layers, and a refusal rather than a wrong picture when a part is missing.
 */

const WHO = { head: 'head-04', body: 'body-07', arm: 'arm-11', leg: 'leg-03' }
const PANEL: [number, number, number] = [0xf6, 0xf2, 0xe6]

describe('the figure', () => {
  it('is drawn at the width asked for, in the frame’s proportions', async () => {
    const figure = await composeFigure(WHO, 341)
    expect(figure).not.toBeNull()
    expect(figure?.width).toBe(341)
    // The rig's frame is 520x690, so the height follows from the width.
    expect(figure?.height).toBe(Math.round((341 * 690) / 520))
  })

  it('actually has ink in it', async () => {
    // A composite that silently drew nothing is the failure this catches — six
    // transparent layers are still a valid PNG of the right size.
    const figure = await composeFigure(WHO, 200)
    let opaque = 0
    for (let i = 3; i < (figure?.data.length ?? 0); i += 4) {
      if ((figure?.data[i] ?? 0) > 200) opaque += 1
    }
    expect(opaque).toBeGreaterThan(2_000)
  })

  it('refuses a character naming a part that no longer exists', async () => {
    // Better no picture than a figure missing a leg. The email drops the image
    // and still says who is inviting.
    expect(await composeFigure({ ...WHO, head: 'head-99' }, 200)).toBeNull()
  })

  it('draws two different characters differently', async () => {
    const one = await composeFigure(WHO, 160)
    const other = await composeFigure({ ...WHO, head: 'head-11', body: 'body-02' }, 160)
    expect(Buffer.compare(one!.data, other!.data)).not.toBe(0)
  })
})

describe('the hero', () => {
  it('is one picture, opaque, on the ground it will sit on', async () => {
    // Flattened here rather than left with an alpha channel: mail clients
    // handle transparency unevenly, and the colour behind it is known.
    const bytes = await composeInviteHero(WHO, 300, PANEL)
    expect(bytes).not.toBeNull()

    const decoded = PNG.sync.read(bytes!)
    expect(decoded.width).toBe(300)
    for (let i = 3; i < decoded.data.length; i += 4) {
      expect(decoded.data[i]).toBe(255)
    }
  })

  it('has the ground colour in its corner, not the burst', async () => {
    const decoded = PNG.sync.read((await composeInviteHero(WHO, 300, PANEL))!)
    expect([decoded.data[0], decoded.data[1], decoded.data[2]]).toEqual(PANEL)
  })

  it('gives up cleanly when the character cannot be drawn', async () => {
    expect(await composeInviteHero({ ...WHO, arm: 'arm-99' }, 300, PANEL)).toBeNull()
  })
})
