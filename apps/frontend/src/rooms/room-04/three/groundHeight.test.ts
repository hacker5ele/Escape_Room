import { describe, expect, it } from 'vitest'
import { Group, Mesh, MeshBasicMaterial, PlaneGeometry } from 'three'
import { sampleGroundY, sampleZoneGroundY } from './groundHeight'

function flatGroundAt(y: number, z = 0): Mesh {
  const mesh = new Mesh(new PlaneGeometry(50, 50), new MeshBasicMaterial())
  mesh.rotation.x = -Math.PI / 2
  mesh.position.set(0, y, z)
  mesh.updateMatrixWorld(true)
  return mesh
}

describe('sampleGroundY', () => {
  it('returns null with no target', () => {
    expect(sampleGroundY(null, 0, 0)).toBeNull()
  })

  it('returns null when the ray misses the target entirely', () => {
    const mesh = flatGroundAt(0)
    expect(sampleGroundY(mesh, 500, 500)).toBeNull()
  })

  it('finds the height of a flat plane directly below the query point', () => {
    const mesh = flatGroundAt(3.5)
    expect(sampleGroundY(mesh, 1, -2)).toBeCloseTo(3.5)
  })
})

describe('sampleZoneGroundY', () => {
  it('returns null with no landscape group', () => {
    expect(sampleZoneGroundY(null, 0, 0)).toBeNull()
  })

  it('tests only the first child while no zones are defined', () => {
    const group = new Group()
    group.add(flatGroundAt(7, -121))
    group.add(flatGroundAt(999, -121))
    group.updateMatrixWorld(true)

    expect(sampleZoneGroundY(group, 0, -121)).toBeCloseTo(7)
  })
})
