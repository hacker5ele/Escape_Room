import { Suspense } from 'react'
import { Canvas } from '@react-three/fiber'
import { AnimatedModel } from '../three/AnimatedModel'

const GUARDIAN_GLB = '/rooms/room-04/character/guardian-dance.glb'

export function GuardianPreview() {
  return (
    <Canvas camera={{ fov: 40, position: [0, 0.6, 3.2] }} gl={{ alpha: true }}>
      <ambientLight intensity={0.7} color="#a9c0cc" />
      <directionalLight position={[3, 4, 2]} intensity={1.2} color="#ffd9a0" />
      <pointLight position={[0, 1, 2]} color="#ff6a3a" intensity={1.5} distance={6} />
      <Suspense fallback={null}>
        <AnimatedModel src={GUARDIAN_GLB} scale={0.85} />
      </Suspense>
    </Canvas>
  )
}
