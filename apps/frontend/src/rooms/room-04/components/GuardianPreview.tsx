import { Suspense } from 'react'
import { Canvas } from '@react-three/fiber'
import { AnimatedModel } from '../three/AnimatedModel'

const GUARDIAN_GLB = '/rooms/room-04/character/guardian-dance.glb'

export function GuardianPreview() {
  return (
    <Canvas camera={{ fov: 36, position: [0, 0.95, 4.6] }} gl={{ alpha: true }}>
      <ambientLight intensity={1.1} color="#ffffff" />
      <directionalLight position={[3, 4, 2]} intensity={1.6} color="#fff2d9" />
      <directionalLight position={[-3, 2, 3]} intensity={0.8} color="#ffffff" />
      <pointLight position={[0, 1, 2]} color="#ff6a3a" intensity={0.9} distance={6} />
      <Suspense fallback={null}>
        <AnimatedModel src={GUARDIAN_GLB} scale={0.8} />
      </Suspense>
    </Canvas>
  )
}
