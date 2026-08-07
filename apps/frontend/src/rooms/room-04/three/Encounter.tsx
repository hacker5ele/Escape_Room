import type { ReactNode } from 'react'
import type { Vector3 } from 'three'
import { ProximityTrigger } from './ProximityTrigger'

interface EncounterProps {
  x: number
  z: number
  color: string
  lightIntensity?: number
  lightDistance?: number
  radius?: number
  hidden: boolean
  disabled?: boolean
  playerPos: React.MutableRefObject<Vector3>
  paused: React.MutableRefObject<boolean>
  onReach: () => void
  children: ReactNode
}

export function Encounter({
  x,
  z,
  color,
  lightIntensity = 3,
  lightDistance = 7,
  radius,
  hidden,
  disabled = false,
  playerPos,
  paused,
  onReach,
  children,
}: EncounterProps) {
  if (hidden) return null

  return (
    <group position={[x, 0, z]}>
      {children}
      <pointLight color={color} intensity={lightIntensity} distance={lightDistance} />
      <ProximityTrigger playerPos={playerPos} x={x} z={z} radius={radius} disabled={disabled} paused={paused} onTrigger={onReach} />
    </group>
  )
}
