import { useEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Vector3 } from 'three'

interface ProximityTriggerProps {
  playerPos: React.MutableRefObject<Vector3>
  x: number
  z: number
  radius?: number
  disabled?: boolean
  paused: React.MutableRefObject<boolean>
  resetKey?: number
  onTrigger: () => void
}

export function ProximityTrigger({
  playerPos,
  x,
  z,
  radius = 2.2,
  disabled = false,
  paused,
  resetKey,
  onTrigger,
}: ProximityTriggerProps) {
  const firedRef = useRef(false)

  useEffect(() => {
    firedRef.current = false
  }, [resetKey])

  useFrame(() => {
    if (disabled || firedRef.current || paused.current) return
    const dx = playerPos.current.x - x
    const dz = playerPos.current.z - z
    if (dx * dx + dz * dz <= radius * radius) {
      firedRef.current = true
      paused.current = true
      onTrigger()
    }
  })

  return null
}
