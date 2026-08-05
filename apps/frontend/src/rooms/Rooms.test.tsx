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

  it('sorts people and furniture together, so you can stand behind things', () => {
    // The whole point of the depth sort: a character further back must be
    // painted before a prop that is further forward.
    const { container } = render(<Stage scene="lobby" actors={[actor('back', 700)]} />)
    const nodes = [...container.querySelectorAll('[data-actor], .stage-prop')]
    const person = nodes.findIndex((node) => node.hasAttribute('data-actor'))
    // The rug is pinned behind everybody; the bin at y=760 is in front.
    expect(person).toBeGreaterThan(0)
    expect(person).toBeLessThan(nodes.length - 1)
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
