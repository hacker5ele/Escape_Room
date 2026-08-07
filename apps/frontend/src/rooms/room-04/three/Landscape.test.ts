import { describe, expect, it } from 'vitest'
import { LANDSCAPE_ZONES, zoneIndexForZ } from './Landscape'

describe('zoneIndexForZ with a single zone', () => {
  it('always resolves to the only zone, whatever z is queried', () => {
    expect(LANDSCAPE_ZONES.length).toBe(1)
    expect(zoneIndexForZ(0)).toBe(0)
    expect(zoneIndexForZ(-1000)).toBe(0)
    expect(zoneIndexForZ(1000)).toBe(0)
  })
})
