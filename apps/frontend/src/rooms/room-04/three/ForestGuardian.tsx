import { useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import { Group, PointLight, Vector3 } from 'three'
import { sampleZoneGroundY } from './groundHeight'
import { AnimatedModel } from './AnimatedModel'

const CLIPS = {
  moving: '/rooms/room-04/character/guardian-running.glb',
  idle: '/rooms/room-04/character/guardian-breathe.glb',
  dance: '/rooms/room-04/character/guardian-dance.glb',
} as const

useGLTF.preload(CLIPS.moving)
useGLTF.preload(CLIPS.idle)
useGLTF.preload(CLIPS.dance)

const DETECT_RADIUS = 14
const LOSE_RADIUS = 20
const CATCH_RADIUS = 2
const CHASE_SPEED = 3.6
const PATROL_SPEED = 1.9
const PATROL_RADIUS = 16
const PATROL_RETARGET_SECONDS = 3
const PATROL_ARRIVE_RADIUS = 1
const TURN_RATE = 6
const MOVE_EPSILON = 0.00001
const FIRST_SIGHT_DANCE_SECONDS = 1.8
const VISIBLE_AHEAD_MARGIN = 4
const STEALTH_DETECT_MULTIPLIER = 0.35
const FREEZE_DETECT_MULTIPLIER = 0.25

interface ForestGuardianProps {
  homeX: number
  homeZ: number
  playerPos: React.MutableRefObject<Vector3>
  paused: React.MutableRefObject<boolean>
  active: boolean
  landscapeRef: React.MutableRefObject<Group | null>
  dangerRef: React.MutableRefObject<{ level: number }>
  boostRef: React.MutableRefObject<{ activeUntil: number }>
  positionOut?: Vector3
  movingRef: React.MutableRefObject<{ isMoving: boolean }>
  graceActive: React.MutableRefObject<boolean>
  onCaught: () => void
}

export function ForestGuardian({
  homeX,
  homeZ,
  playerPos,
  paused,
  active,
  landscapeRef,
  dangerRef,
  boostRef,
  positionOut,
  movingRef,
  graceActive,
  onCaught,
}: ForestGuardianProps) {
  const rigRef = useRef<Group>(null)
  const lightRef = useRef<PointLight>(null)
  const guardianPos = useRef(new Vector3(homeX, 0, homeZ))
  const patrolTarget = useRef(new Vector3(homeX, 0, homeZ))
  const patrolTimer = useRef(0)
  const facingAngle = useRef(0)
  const groundY = useRef<number | null>(null)
  const firedRef = useRef(false)
  const hasDetectedBefore = useRef(false)
  const danceTimer = useRef(0)
  const [chasing, setChasing] = useState(false)
  const [moving, setMoving] = useState(false)
  const [dancing, setDancing] = useState(false)

  useFrame((state, delta) => {
    if (!active || paused.current) return
    if (groundY.current === null) {
      groundY.current = sampleZoneGroundY(landscapeRef.current, guardianPos.current.x, guardianPos.current.z)
    }

    const dxPlayer = playerPos.current.x - guardianPos.current.x
    const dzPlayer = playerPos.current.z - guardianPos.current.z
    const distToPlayer = Math.hypot(dxPlayer, dzPlayer)

    const isVisibleToPlayer = guardianPos.current.z <= playerPos.current.z + VISIBLE_AHEAD_MARGIN
    const stealthed = state.clock.elapsedTime < boostRef.current.activeUntil
    const frozen = !movingRef.current.isMoving
    let detectRadius = DETECT_RADIUS
    if (stealthed) detectRadius *= STEALTH_DETECT_MULTIPLIER
    if (frozen) detectRadius *= FREEZE_DETECT_MULTIPLIER

    let isChasing = chasing
    if (!isChasing && distToPlayer < detectRadius && isVisibleToPlayer && !graceActive.current) {
      isChasing = true
      if (!hasDetectedBefore.current) {
        hasDetectedBefore.current = true
        danceTimer.current = FIRST_SIGHT_DANCE_SECONDS
      }
    } else if (isChasing && distToPlayer > LOSE_RADIUS) {
      isChasing = false
    }
    if (isChasing !== chasing) setChasing(isChasing)

    let moveX = 0
    let moveZ = 0

    if (danceTimer.current > 0) {
      danceTimer.current -= delta
    } else if (isChasing) {
      const step = Math.min(CHASE_SPEED * delta, Math.max(0, distToPlayer - CATCH_RADIUS))
      if (distToPlayer > 0.01) {
        moveX = (dxPlayer / distToPlayer) * step
        moveZ = (dzPlayer / distToPlayer) * step
      }
      const proximity = 1 - (distToPlayer - CATCH_RADIUS) / (DETECT_RADIUS - CATCH_RADIUS)
      dangerRef.current.level = Math.max(dangerRef.current.level, Math.min(1, Math.max(0, proximity)))
      if (!firedRef.current && distToPlayer <= CATCH_RADIUS) {
        firedRef.current = true
        onCaught()
      }
    } else {
      firedRef.current = false
      patrolTimer.current -= delta
      const distToTarget = Math.hypot(
        patrolTarget.current.x - guardianPos.current.x,
        patrolTarget.current.z - guardianPos.current.z,
      )
      if (patrolTimer.current <= 0 || distToTarget < PATROL_ARRIVE_RADIUS) {
        patrolTimer.current = PATROL_RETARGET_SECONDS + Math.random() * PATROL_RETARGET_SECONDS
        const angle = Math.random() * Math.PI * 2
        const radius = Math.random() * PATROL_RADIUS
        patrolTarget.current.set(homeX + Math.cos(angle) * radius, 0, homeZ + Math.sin(angle) * radius)
      }
      const dxPatrol = patrolTarget.current.x - guardianPos.current.x
      const dzPatrol = patrolTarget.current.z - guardianPos.current.z
      const distPatrol = Math.hypot(dxPatrol, dzPatrol)
      if (distPatrol > 0.3) {
        moveX = (dxPatrol / distPatrol) * PATROL_SPEED * delta
        moveZ = (dzPatrol / distPatrol) * PATROL_SPEED * delta
      }
    }

    guardianPos.current.x += moveX
    guardianPos.current.z += moveZ
    positionOut?.copy(guardianPos.current)

    const isMoving = moveX * moveX + moveZ * moveZ > MOVE_EPSILON
    if (isMoving !== moving) setMoving(isMoving)
    if (isMoving) {
      const targetAngle = Math.atan2(moveX, moveZ)
      let diff = (targetAngle - facingAngle.current) % (Math.PI * 2)
      if (diff > Math.PI) diff -= Math.PI * 2
      else if (diff < -Math.PI) diff += Math.PI * 2
      facingAngle.current += diff * Math.min(1, TURN_RATE * delta)
    }

    const isDancing = danceTimer.current > 0
    if (isDancing !== dancing) setDancing(isDancing)

    if (rigRef.current) {
      rigRef.current.position.set(guardianPos.current.x, groundY.current ?? 0, guardianPos.current.z)
      rigRef.current.rotation.y = facingAngle.current
    }
    if (lightRef.current) {
      lightRef.current.intensity = isChasing ? 2.2 : 1.4
    }
  })

  if (!active) return null

  const clipSrc = dancing ? CLIPS.dance : moving ? CLIPS.moving : CLIPS.idle

  return (
    <group ref={rigRef} scale={0.62}>
      <AnimatedModel src={clipSrc} />
      <pointLight ref={lightRef} color={chasing ? '#ff6a3a' : '#5a7a4a'} distance={7} intensity={1.4} />
    </group>
  )
}
