import { useEffect, useRef } from 'react'
import { useAnimations, useGLTF } from '@react-three/drei'
import type { Group } from 'three'

interface AnimatedModelProps {
  src: string
  scale?: number
}

export function AnimatedModel({ src, scale }: AnimatedModelProps) {
  const group = useRef<Group>(null)
  const { scene, animations } = useGLTF(src)
  const { actions, names } = useAnimations(animations, group)

  useEffect(() => {
    const name = names[0]
    if (!name) return
    const action = actions[name]
    action?.reset().fadeIn(0.25).play()
    return () => {
      action?.fadeOut(0.25)
    }
  }, [actions, names])

  return (
    <group ref={group} scale={scale}>
      <primitive object={scene} />
    </group>
  )
}
