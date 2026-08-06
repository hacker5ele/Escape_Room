import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Group, PointLight } from 'three'
import { PRIZE_GLB } from '../story'
import { AnimatedModel } from './AnimatedModel'

const CHARACTER_GLB = '/rooms/room-04/character/dance.glb'
const RISE_SPEED = 3.4
const SPIN_SPEED = 0.8
const LIGHT_GROWTH_PER_SECOND = 5
const LIGHT_MAX_INTENSITY = 20

interface AscensionProps {
  originX: number
  originY: number
  originZ: number
}

export function Ascension({ originX, originY, originZ }: AscensionProps) {
  const characterRef = useRef<Group>(null)
  const prizeRef = useRef<Group>(null)
  const lightRef = useRef<PointLight>(null)
  const elapsed = useRef(0)

  useFrame((_, delta) => {
    elapsed.current += delta
    const height = originY + elapsed.current * RISE_SPEED
    if (characterRef.current) {
      characterRef.current.position.set(originX, height, originZ)
      characterRef.current.rotation.y += delta * SPIN_SPEED
    }
    if (prizeRef.current) {
      prizeRef.current.position.set(originX + 1.2, height + 0.6, originZ)
      prizeRef.current.rotation.y += delta * SPIN_SPEED * 1.4
    }
    if (lightRef.current) {
      lightRef.current.position.set(originX, height, originZ)
      lightRef.current.intensity = Math.min(LIGHT_MAX_INTENSITY, 6 + elapsed.current * LIGHT_GROWTH_PER_SECOND)
    }
  })

  return (
    <>
      <group ref={characterRef}>
        <AnimatedModel src={CHARACTER_GLB} scale={0.6} />
      </group>
      <group ref={prizeRef}>
        <AnimatedModel src={PRIZE_GLB} scale={0.35} />
      </group>
      <pointLight ref={lightRef} color="#ffe9a8" distance={40} intensity={6} />
    </>
  )
}
