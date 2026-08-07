import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import { Box3, Vector3 } from 'three'
import type { Group, PointLight } from 'three'
import type { VisionDef } from '../story'
import { Encounter } from './Encounter'
import { STREET_Y } from './Landscape'

const BOX_TARGET_SIZE = 0.5
const BOX_REST_HEIGHT = 0.04

interface VisionCubeProps {
  vision: VisionDef
  playerPos: React.MutableRefObject<Vector3>
  hidden: boolean
  triggering: boolean
  paused: React.MutableRefObject<boolean>
  landscapeRef: React.MutableRefObject<Group | null>
  resetKey?: number
  onReach: () => void
}

function useNormalizedBoxModel(src: string) {
  const { scene } = useGLTF(src)
  return useMemo(() => {
    const instance = scene.clone(true)
    const size = new Box3().setFromObject(instance).getSize(new Vector3())
    const maxDim = Math.max(size.x, size.y, size.z) || 1
    instance.scale.setScalar(BOX_TARGET_SIZE / maxDim)
    const scaledBox = new Box3().setFromObject(instance)
    instance.position.x -= (scaledBox.min.x + scaledBox.max.x) / 2
    instance.position.z -= (scaledBox.min.z + scaledBox.max.z) / 2
    instance.position.y -= scaledBox.min.y
    return instance
  }, [scene])
}

export function VisionCube(props: VisionCubeProps) {
  const { vision, playerPos, hidden, triggering, paused, resetKey, onReach } = props
  const instance = useNormalizedBoxModel(vision.boxGlb)
  const groupRef = useRef<Group>(null)
  const burstRef = useRef<PointLight>(null)

  useFrame((state) => {
    if (groupRef.current) {
      groupRef.current.rotation.y += triggering ? 0.08 : 0.012
      groupRef.current.position.y = STREET_Y + BOX_REST_HEIGHT
      const scale = triggering ? 1.1 + Math.sin(state.clock.elapsedTime * 20) * 0.08 : 1
      groupRef.current.scale.setScalar(scale)
    }
    if (burstRef.current) {
      burstRef.current.intensity = triggering ? 8 : 0
    }
  })

  return (
    <Encounter
      x={vision.x}
      z={vision.z}
      color={vision.color}
      hidden={hidden}
      playerPos={playerPos}
      paused={paused}
      resetKey={resetKey}
      onReach={onReach}
    >
      <group ref={groupRef}>
        <primitive object={instance} />
        <pointLight ref={burstRef} color={vision.color} distance={8} intensity={0} />
        {!triggering && <pointLight color={vision.color} distance={4} intensity={1.2} position={[0, 1, 0]} />}
      </group>
    </Encounter>
  )
}
