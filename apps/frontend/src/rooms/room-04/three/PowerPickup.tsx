import { Suspense, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import type { Group, Vector3 } from 'three'
import { pathCenterX } from '../story'
import { sampleZoneGroundY } from './groundHeight'

const PROP_MODEL = '/rooms/room-04/props/witchcraft-alchemy.glb'
useGLTF.preload(PROP_MODEL)

interface PickupSpot {
  x: number
  z: number
  rotationY: number
  scale: number
}

const PICKUP_SPOTS: readonly PickupSpot[] = [
  { x: pathCenterX(-15) + 5, z: -15, rotationY: 0.4, scale: 1 },
  { x: pathCenterX(-40) - 6, z: -40, rotationY: 2.1, scale: 1.1 },
  { x: pathCenterX(-55) + 7, z: -55, rotationY: 1.2, scale: 0.9 },
  { x: pathCenterX(-75) - 5, z: -75, rotationY: 3.4, scale: 1 },
  { x: pathCenterX(-100) + 6, z: -100, rotationY: 0.8, scale: 1.15 },
  { x: pathCenterX(-130) - 7, z: -130, rotationY: 2.7, scale: 0.95 },
  { x: pathCenterX(-150) + 5, z: -150, rotationY: 1.6, scale: 1 },
  { x: pathCenterX(-170) - 6, z: -170, rotationY: 3.0, scale: 1.05 },
]

const COLLECT_RADIUS = 2.5
const PICKUP_SCALE = 0.5
const BOB_HEIGHT = 0.15
const SPIN_SPEED = 0.9

interface PowerPickupInstanceProps {
  spot: PickupSpot
  playerPos: React.MutableRefObject<Vector3>
  paused: React.MutableRefObject<boolean>
  landscapeRef: React.MutableRefObject<Group | null>
  onCollect: (elapsedTime: number) => void
}

function PowerPickupInstance({ spot, playerPos, paused, landscapeRef, onCollect }: PowerPickupInstanceProps) {
  const { scene } = useGLTF(PROP_MODEL)
  const instance = useMemo(() => scene.clone(true), [scene])
  const groupRef = useRef<Group>(null)
  const groundY = useRef<number | null>(null)
  const firedRef = useRef(false)
  const [collected, setCollected] = useState(false)

  useFrame((state) => {
    if (groundY.current === null) {
      const y = sampleZoneGroundY(landscapeRef.current, spot.x, spot.z)
      if (y === null) return
      groundY.current = y
    }
    if (groupRef.current) {
      groupRef.current.position.set(
        spot.x,
        groundY.current + 0.4 + Math.sin(state.clock.elapsedTime * 2) * BOB_HEIGHT,
        spot.z,
      )
      groupRef.current.rotation.y = spot.rotationY + state.clock.elapsedTime * SPIN_SPEED
    }
    if (!firedRef.current && !paused.current) {
      const dx = playerPos.current.x - spot.x
      const dz = playerPos.current.z - spot.z
      if (dx * dx + dz * dz <= COLLECT_RADIUS * COLLECT_RADIUS) {
        firedRef.current = true
        setCollected(true)
        onCollect(state.clock.elapsedTime)
      }
    }
  })

  if (collected) return null

  return (
    <group ref={groupRef} scale={spot.scale * PICKUP_SCALE}>
      <primitive object={instance} />
      <pointLight color="#b26bff" distance={5} intensity={1.6} />
    </group>
  )
}

interface PowerPickupsProps {
  playerPos: React.MutableRefObject<Vector3>
  paused: React.MutableRefObject<boolean>
  landscapeRef: React.MutableRefObject<Group | null>
  onCollect: (elapsedTime: number) => void
}

export function PowerPickups({ playerPos, paused, landscapeRef, onCollect }: PowerPickupsProps) {
  return (
    <>
      {PICKUP_SPOTS.map((spot, i) => (
        <Suspense key={i} fallback={null}>
          <PowerPickupInstance spot={spot} playerPos={playerPos} paused={paused} landscapeRef={landscapeRef} onCollect={onCollect} />
        </Suspense>
      ))}
    </>
  )
}
