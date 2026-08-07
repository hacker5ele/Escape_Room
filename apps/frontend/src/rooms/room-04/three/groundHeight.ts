import { Raycaster, Vector3, type Group, type Object3D } from 'three'
import { zoneIndexForZ } from './Landscape'

const raycaster = new Raycaster()
const origin = new Vector3()
const DOWN = new Vector3(0, -1, 0)
const RAY_START_HEIGHT = 80

export function sampleGroundY(target: Object3D | null | undefined, x: number, z: number): number | null {
  if (!target) return null
  origin.set(x, RAY_START_HEIGHT, z)
  raycaster.set(origin, DOWN)
  raycaster.far = RAY_START_HEIGHT + 60
  const hits = raycaster.intersectObject(target, true)
  return hits[0]?.point.y ?? null
}

export function sampleZoneGroundY(landscapeGroup: Group | null, x: number, z: number): number | null {
  if (!landscapeGroup) return null
  const zoneObject = landscapeGroup.children[zoneIndexForZ(z)]
  return sampleGroundY(zoneObject, x, z)
}
