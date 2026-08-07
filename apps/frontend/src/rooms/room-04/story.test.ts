import { describe, expect, it } from 'vitest'
import { pathCenterX, VISIONS, WORLD } from './story'

describe('pathCenterX', () => {
  it('is centred at the spawn point', () => {
    expect(pathCenterX(WORLD.startZ)).toBeCloseTo(0)
  })

  it('stays within the configured amplitude', () => {
    for (let z = WORLD.startZ; z >= WORLD.endZ; z -= 5) {
      expect(Math.abs(pathCenterX(z))).toBeLessThanOrEqual(2.2)
    }
  })
})

describe('VISIONS', () => {
  it('has a unique id and reward for every vision', () => {
    const ids = VISIONS.map((v) => v.id)
    expect(new Set(ids).size).toBe(ids.length)
    const wandGrants = VISIONS.filter((v) => v.reward === 'wand')
    expect(wandGrants.length).toBe(1)
  })
})
