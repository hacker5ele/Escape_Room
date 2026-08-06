import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Group, PointLight, Vector3 } from 'three'
import { WORLD, pathCenterX } from '../story'
import { sampleZoneGroundY } from './groundHeight'

interface WizardBlockerProps {
  playerPos: React.MutableRefObject<Vector3>
  banished: boolean
  paused: React.MutableRefObject<boolean>
  landscapeRef: React.MutableRefObject<Group | null>
  finaleActive: boolean
  dangerRef: React.MutableRefObject<{ level: number }>
  positionOut?: Vector3
  onReach: () => void
}

const WIZARD_START_X = pathCenterX(WORLD.wizardZ)
const REACH_RADIUS = 4
const CHASE_SPEED = 4.2
const SENSE_RADIUS = 30

export function WizardBlocker({
  playerPos,
  banished,
  paused,
  landscapeRef,
  finaleActive,
  dangerRef,
  positionOut,
  onReach,
}: WizardBlockerProps) {
  const groupRef = useRef<Group>(null)
  const lightRef = useRef<PointLight>(null)
  const wizardPos = useRef(new Vector3(WIZARD_START_X, 0, WORLD.wizardZ))
  const groundY = useRef<number | null>(null)
  const firedRef = useRef(false)

  useFrame((state, delta) => {
    if (banished) return
    if (groundY.current === null) {
      groundY.current = sampleZoneGroundY(landscapeRef.current, wizardPos.current.x, wizardPos.current.z)
    }

    if (finaleActive && !paused.current) {
      const dx = playerPos.current.x - wizardPos.current.x
      const dz = playerPos.current.z - wizardPos.current.z
      const dist = Math.hypot(dx, dz)
      const step = Math.min(CHASE_SPEED * delta, Math.max(0, dist - REACH_RADIUS))
      if (dist > 0.01) {
        wizardPos.current.x += (dx / dist) * step
        wizardPos.current.z += (dz / dist) * step
      }
      const proximity = 1 - (dist - REACH_RADIUS) / (SENSE_RADIUS - REACH_RADIUS)
      dangerRef.current.level = Math.max(dangerRef.current.level, Math.min(1, Math.max(0, proximity)))
      positionOut?.copy(wizardPos.current)
    }

    if (!firedRef.current && !paused.current) {
      const dx = playerPos.current.x - wizardPos.current.x
      const dz = playerPos.current.z - wizardPos.current.z
      if (dx * dx + dz * dz <= REACH_RADIUS * REACH_RADIUS) {
        firedRef.current = true
        paused.current = true
        onReach()
      }
    }

    if (groupRef.current) {
      groupRef.current.position.set(wizardPos.current.x, groundY.current ?? 0, wizardPos.current.z)
      groupRef.current.rotation.y = Math.PI + Math.sin(state.clock.elapsedTime) * 0.1
    }
    if (lightRef.current) {
      lightRef.current.intensity = finaleActive ? 6 : 4
    }
  })

  if (banished) return null

  return (
    <group ref={groupRef} scale={1.2}>
      <mesh position={[0, 1, 0]}>
        <coneGeometry args={[0.6, 2, 8]} />
        <meshStandardMaterial color="#3a2a4a" />
      </mesh>
      <mesh position={[0, 2.2, 0]}>
        <sphereGeometry args={[0.3, 12, 12]} />
        <meshStandardMaterial color="#e8d9c0" />
      </mesh>
      <pointLight ref={lightRef} color="#ff3030" intensity={4} distance={10} />
    </group>
  )
}
