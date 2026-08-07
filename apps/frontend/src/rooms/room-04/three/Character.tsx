import { useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import { Vector3, type Group, type Mesh, type MeshBasicMaterial } from 'three'
import { play } from '../../../audio/sfx'
import { AnimatedModel } from './AnimatedModel'

export type CharacterState = 'running' | 'idle' | 'fight' | 'celebrate' | 'dance'
type ClipKey = CharacterState | 'walking'

const CLIPS: Record<ClipKey, string> = {
  running: '/rooms/room-04/character/running.glb',
  idle: '/rooms/room-04/character/idle.glb',
  fight: '/rooms/room-04/character/fight.glb',
  celebrate: '/rooms/room-04/character/backflip.glb',
  dance: '/rooms/room-04/character/dance.glb',
  walking: '/rooms/room-04/character/walking.glb',
}

useGLTF.preload(CLIPS.running)
useGLTF.preload(CLIPS.idle)
useGLTF.preload(CLIPS.fight)
useGLTF.preload(CLIPS.celebrate)
useGLTF.preload(CLIPS.dance)
useGLTF.preload(CLIPS.walking)

const SHADOW_RADIUS = 0.5
const SHADOW_Y_OFFSET = 0.02

function ContactShadow({ playerPos }: { playerPos: React.MutableRefObject<Vector3> }) {
  const meshRef = useRef<Mesh>(null)

  useFrame(() => {
    if (!meshRef.current) return
    meshRef.current.position.set(playerPos.current.x, playerPos.current.y + SHADOW_Y_OFFSET, playerPos.current.z)
  })

  return (
    <mesh ref={meshRef} rotation={[-Math.PI / 2, 0, 0]}>
      <circleGeometry args={[SHADOW_RADIUS, 24]} />
      <meshBasicMaterial color="#000000" transparent opacity={0.35} depthWrite={false} toneMapped={false} />
    </mesh>
  )
}

const DUST_POOL_SIZE = 4
const DUST_LIFETIME = 0.4
const DUST_RADIUS = 0.22

interface DustPuff {
  x: number
  y: number
  z: number
  spawnedAt: number
}

function DustPuffs({ puffs }: { puffs: React.MutableRefObject<DustPuff[]> }) {
  const meshRefs = useRef<(Mesh | null)[]>([])

  useFrame((state) => {
    puffs.current.forEach((puff, i) => {
      const mesh = meshRefs.current[i]
      if (!mesh) return
      const age = state.clock.elapsedTime - puff.spawnedAt
      if (age < 0 || age > DUST_LIFETIME) {
        mesh.visible = false
        return
      }
      mesh.visible = true
      mesh.position.set(puff.x, puff.y, puff.z)
      const t = age / DUST_LIFETIME
      mesh.scale.setScalar(0.4 + t * 0.8)
      ;(mesh.material as MeshBasicMaterial).opacity = 0.35 * (1 - t)
    })
  })

  return (
    <>
      {Array.from({ length: DUST_POOL_SIZE }, (_, i) => (
        <mesh
          key={i}
          ref={(el) => {
            meshRefs.current[i] = el
          }}
          rotation={[-Math.PI / 2, 0, 0]}
          visible={false}
        >
          <circleGeometry args={[DUST_RADIUS, 10]} />
          <meshBasicMaterial color="#c9bfa8" transparent opacity={0} depthWrite={false} toneMapped={false} />
        </mesh>
      ))}
    </>
  )
}

interface CharacterProps {
  playerPos: React.MutableRefObject<Vector3>
  state: CharacterState
}

const TURN_RATE = 10
const MOVE_EPSILON = 0.0001
const FOOTSTEP_INTERVAL = 0.34

export function Character({ playerPos, state }: CharacterProps) {
  const rigRef = useRef<Group>(null)
  const prevPos = useRef(new Vector3())
  const prevPosInitialized = useRef(false)
  const facingAngle = useRef(Math.PI)
  const footstepTimer = useRef(0)
  const nextPuffIndex = useRef(0)
  const puffs = useRef<DustPuff[]>(
    Array.from({ length: DUST_POOL_SIZE }, () => ({ x: 0, y: 0, z: 0, spawnedAt: -999 })),
  )
  const [moving, setMoving] = useState(false)

  useFrame((state, delta) => {
    if (!rigRef.current) return
    rigRef.current.position.copy(playerPos.current)

    if (!prevPosInitialized.current) {
      prevPos.current.copy(playerPos.current)
      prevPosInitialized.current = true
    }

    const dx = playerPos.current.x - prevPos.current.x
    const dz = playerPos.current.z - prevPos.current.z
    const isMoving = dx * dx + dz * dz > MOVE_EPSILON
    if (isMoving !== moving) setMoving(isMoving)
    if (isMoving) {
      const targetAngle = Math.atan2(dx, dz)
      let diff = (targetAngle - facingAngle.current) % (Math.PI * 2)
      if (diff > Math.PI) diff -= Math.PI * 2
      else if (diff < -Math.PI) diff += Math.PI * 2
      facingAngle.current += diff * Math.min(1, TURN_RATE * delta)

      footstepTimer.current += delta
      if (footstepTimer.current >= FOOTSTEP_INTERVAL) {
        footstepTimer.current = 0
        play('footstep')
        const slot = puffs.current[nextPuffIndex.current]
        if (slot) {
          slot.x = playerPos.current.x
          slot.y = playerPos.current.y + 0.02
          slot.z = playerPos.current.z
          slot.spawnedAt = state.clock.elapsedTime
        }
        nextPuffIndex.current = (nextPuffIndex.current + 1) % DUST_POOL_SIZE
      }
    } else {
      footstepTimer.current = FOOTSTEP_INTERVAL
    }
    prevPos.current.copy(playerPos.current)

    rigRef.current.rotation.y = facingAngle.current
  })

  const effectiveState: ClipKey = state === 'running' ? (moving ? 'walking' : 'idle') : state

  return (
    <>
      <ContactShadow playerPos={playerPos} />
      <DustPuffs puffs={puffs} />
      <group ref={rigRef} scale={0.6}>
        <AnimatedModel src={CLIPS[effectiveState]} />
      </group>
    </>
  )
}
