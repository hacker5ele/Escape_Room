import { forwardRef, Suspense, useMemo } from 'react'
import { useGLTF } from '@react-three/drei'
import { CanvasTexture, RepeatWrapping, type Group } from 'three'

const LANDSCAPE_MODELS = {
  city: '/rooms/room-04/landscape/city.glb',
} as const

interface ZoneDef {
  model: keyof typeof LANDSCAPE_MODELS
  z: number
  x: number
  scale: number
  rotationY: number
  floorOffset: number
}

export const LANDSCAPE_ZONES: readonly ZoneDef[] = [
  { model: 'city', x: -62.14, z: -38.73, scale: 8.536, rotationY: 0, floorOffset: 1.174 },
]

function LandscapePiece({ zone, hidden }: { zone: ZoneDef; hidden: boolean }) {
  const { scene } = useGLTF(LANDSCAPE_MODELS[zone.model])
  const instance = useMemo(() => scene.clone(true), [scene])

  return (
    <group visible={!hidden}>
      <primitive object={instance} position={[zone.x, zone.floorOffset, zone.z]} scale={zone.scale} rotation={[0, zone.rotationY, 0]} />
      <StreetFloor />
    </group>
  )
}

export const STREET_Y = 0.7
const STREET_WIDTH = 450
const STREET_LENGTH = 240
const STREET_CENTER_Z = -95
const STREET_TILE_SIZE = 8

function createStreetTexture(): CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 256
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#736a58'
  ctx.fillRect(0, 0, 256, 256)
  for (let i = 0; i < 1400; i++) {
    const shade = Math.random() > 0.5 ? '0,0,0' : '255,255,255'
    ctx.fillStyle = `rgba(${shade},${Math.random() * 0.08})`
    ctx.fillRect(Math.random() * 256, Math.random() * 256, 2, 2)
  }
  ctx.strokeStyle = '#cabf9d'
  ctx.lineWidth = 4
  ctx.setLineDash([22, 18])
  ctx.beginPath()
  ctx.moveTo(128, 0)
  ctx.lineTo(128, 256)
  ctx.stroke()
  const texture = new CanvasTexture(canvas)
  texture.wrapS = RepeatWrapping
  texture.wrapT = RepeatWrapping
  texture.repeat.set(STREET_WIDTH / STREET_TILE_SIZE, STREET_LENGTH / STREET_TILE_SIZE)
  return texture
}

function StreetFloor() {
  const texture = useMemo(() => createStreetTexture(), [])

  return (
    <mesh position={[0, STREET_Y, STREET_CENTER_Z]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <planeGeometry args={[STREET_WIDTH, STREET_LENGTH]} />
      <meshStandardMaterial map={texture} roughness={1} />
    </mesh>
  )
}

export function zoneIndexForZ(z: number): number {
  let closest = 0
  let closestDist = Infinity
  for (let i = 0; i < LANDSCAPE_ZONES.length; i++) {
    const dist = Math.abs(z - LANDSCAPE_ZONES[i]!.z)
    if (dist < closestDist) {
      closestDist = dist
      closest = i
    }
  }
  return closest
}

interface LandscapeProps {
  hidden: boolean
}

export const Landscape = forwardRef<Group, LandscapeProps>(function Landscape({ hidden }, ref) {
  return (
    <group ref={ref}>
      {LANDSCAPE_ZONES.map((zone, i) => (
        <Suspense key={i} fallback={null}>
          <LandscapePiece zone={zone} hidden={hidden} />
        </Suspense>
      ))}
    </group>
  )
})
