import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ROOM_IDS } from '@escape-room/shared'
import { ROOMS, roomDefinition } from './registry'
import { EMOTES, emoteDuration, isEmoteName } from '../character/emotes'
import { SCENES, WALK_BOUNDS, pieceSize, spawnPoint } from '../stage/scenes'
import { Stage } from '../stage/Stage'
import { randomCharacter } from '../character/parts'
import { EmoteBar } from '../lobby/EmoteBar'
import userEvent from '@testing-library/user-event'

describe('the room registry', () => {
  it('has an entry for every room in the contract, and no others', () => {
    // The backend registry is checked against ROOM_IDS by its own test; this is
    // the other half, so the two cannot drift apart silently.
    expect(ROOMS.map((room) => room.id)).toEqual([...ROOM_IDS])
  })

  it('names a scene that actually exists for every room', () => {
    for (const roomId of ROOM_IDS) {
      expect(SCENES[roomDefinition(roomId).scene]).toBeDefined()
    }
  })
})

describe('the scenery', () => {
  it('has artwork for every prop every scene asks for', () => {
    // Catches a generation run that quietly gave up: a scene referring to a
    // piece that was never made would simply render nothing.
    for (const [name, scene] of Object.entries(SCENES)) {
      expect(pieceSize(scene.wall), `${name} wall`).not.toBeNull()
      expect(pieceSize(scene.floor), `${name} floor`).not.toBeNull()
      for (const prop of scene.props) {
        expect(pieceSize(prop.piece), `${name}: ${prop.piece}`).not.toBeNull()
      }
    }
  })

  it('spawns everybody inside the walkable box', () => {
    for (const total of [1, 2, 3, 4]) {
      for (let index = 0; index < total; index += 1) {
        const point = spawnPoint(index, total)
        expect(point.x).toBeGreaterThanOrEqual(WALK_BOUNDS.minX)
        expect(point.x).toBeLessThanOrEqual(WALK_BOUNDS.maxX)
        expect(point.y).toBeGreaterThanOrEqual(WALK_BOUNDS.minY)
        expect(point.y).toBeLessThanOrEqual(WALK_BOUNDS.maxY)
      }
    }
  })

  it('centres the party whatever its size', () => {
    for (const total of [1, 2, 3, 4]) {
      const middle =
        Array.from({ length: total }, (_, i) => spawnPoint(i, total).x).reduce((a, b) => a + b, 0) /
        total
      expect(middle).toBeCloseTo(800, 5)
    }
  })
})

describe('the stage', () => {
  const actor = (userId: string, y: number) => ({
    userId,
    name: userId,
    character: randomCharacter(),
    x: 800,
    y,
    facing: 1 as const,
    walking: false,
    emote: null,
  })

  it('draws one figure per person', () => {
    const { container } = render(
      <Stage scene="lobby" actors={[actor('a', 800), actor('b', 820)]} />,
    )
    expect(container.querySelectorAll('[data-actor]')).toHaveLength(2)
  })

  it('layers people and furniture by depth, so you can stand behind things', () => {
    const { container } = render(<Stage scene="lobby" actors={[actor('me', 700)]} />)

    const depthOf = (node: Element) => Number((node as HTMLElement).style.zIndex)
    const person = container.querySelector('[data-actor]')!
    const sofa = container.querySelector('img[src*="lobby-sofa"]')!
    const bin = container.querySelector('img[src*="lobby-bin"]')!

    // Standing at y=700, level with the sofa and behind the bin at y=760.
    expect(depthOf(person)).toBe(700)
    expect(depthOf(person)).toBeLessThan(depthOf(bin))
    expect(depthOf(sofa)).toBeLessThanOrEqual(depthOf(person))
  })

  it('keeps the DOM order stable as people move', () => {
    // This is the fix, not a preference. Sorting the children by position meant
    // React reordered keyed nodes whenever a walking player crossed a prop —
    // and moving a DOM node restarts its CSS animations, so the drop-in replayed
    // dozens of times a minute. Nothing may be re-inserted.
    const { container, rerender } = render(
      <Stage scene="lobby" actors={[actor('a', 700), actor('b', 860)]} />,
    )
    const before = [...container.querySelectorAll('[data-actor], .stage-prop')]

    // Walk them past each other and past the furniture.
    rerender(<Stage scene="lobby" actors={[actor('a', 870), actor('b', 695)]} />)
    const after = [...container.querySelectorAll('[data-actor], .stage-prop')]

    expect(after).toHaveLength(before.length)
    // The very same nodes, in the very same slots — moved, not recreated.
    after.forEach((node, index) => expect(node).toBe(before[index]))
  })

  it('puts a rug behind whoever stands on it', () => {
    // A flat piece sits at the front of the room but must draw behind feet, so
    // it carries an explicit depth rather than using its own ground line.
    const { container } = render(<Stage scene="lobby" actors={[actor('me', 800)]} />)
    const rug = container.querySelector('img[src*="lobby-rug"]')! as HTMLElement
    const person = container.querySelector('[data-actor]')! as HTMLElement
    expect(Number(rug.style.zIndex)).toBeLessThan(Number(person.style.zIndex))
  })
})

describe('emotes', () => {
  it('every one has a duration the client can time out on', () => {
    for (const emote of EMOTES) {
      expect(emoteDuration(emote.id)).toBeGreaterThan(0)
      expect(isEmoteName(emote.id)).toBe(true)
    }
    expect(isEmoteName('breakdance')).toBe(false)
  })

  it('refuses a second emote until the cooldown passes', async () => {
    const onEmote = vi.fn()
    render(<EmoteBar onEmote={onEmote} />)

    await userEvent.click(screen.getByRole('button', { name: 'Wave' }))
    await userEvent.click(screen.getByRole('button', { name: 'Dance' }))

    // Mashing the bar into a strobe is the failure this prevents.
    expect(onEmote).toHaveBeenCalledTimes(1)
    expect(onEmote).toHaveBeenCalledWith('wave')
  })
})
