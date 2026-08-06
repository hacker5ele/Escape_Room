import { Suspense, useMemo, useRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import { AdditiveBlending, BufferAttribute, type Group, type Points } from 'three'
import { PRIZE_GLB } from '../story'

const SPARKLE_COUNT = 90
const SPARKLE_RADIUS = 1.6

function SpinningPrize() {
  const { scene } = useGLTF(PRIZE_GLB)
  const ref = useRef<Group>(null)

  useFrame((state, delta) => {
    if (!ref.current) return
    ref.current.rotation.y += delta * 0.5
    ref.current.position.y = Math.sin(state.clock.elapsedTime * 1.2) * 0.06
  })

  return (
    <group ref={ref} scale={1.4}>
      <primitive object={scene} />
    </group>
  )
}

function Sparkles() {
  const pointsRef = useRef<Points>(null)

  const positions = useMemo(() => {
    const array = new Float32Array(SPARKLE_COUNT * 3)
    for (let i = 0; i < SPARKLE_COUNT; i += 1) {
      const angle = Math.random() * Math.PI * 2
      const radius = SPARKLE_RADIUS * (0.5 + Math.random() * 0.5)
      const height = (Math.random() - 0.5) * 2
      array[i * 3] = Math.cos(angle) * radius
      array[i * 3 + 1] = height
      array[i * 3 + 2] = Math.sin(angle) * radius
    }
    return array
  }, [])

  useFrame((state, delta) => {
    if (!pointsRef.current) return
    pointsRef.current.rotation.y += delta * 0.15
    const material = pointsRef.current.material as import('three').PointsMaterial
    material.opacity = 0.5 + Math.sin(state.clock.elapsedTime * 2) * 0.3
  })

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <primitive attach="attributes-position" object={new BufferAttribute(positions, 3)} />
      </bufferGeometry>
      <pointsMaterial color="#ffe9a8" size={0.05} transparent opacity={0.7} blending={AdditiveBlending} depthWrite={false} />
    </points>
  )
}

export function PrizeModel() {
  return (
    <Canvas camera={{ fov: 40, position: [0, 0.4, 3] }} gl={{ alpha: true }}>
      <ambientLight intensity={0.5} color="#c9b8ff" />
      <directionalLight position={[3, 4, 2]} intensity={1.4} color="#ffe9a8" />
      <directionalLight position={[-3, 1, -2]} intensity={0.6} color="#7a5aff" />
      <pointLight position={[0, -0.6, 1.5]} intensity={2} color="#ffcf7a" distance={4} />
      <Suspense fallback={null}>
        <SpinningPrize />
        <Sparkles />
      </Suspense>
    </Canvas>
  )
}
