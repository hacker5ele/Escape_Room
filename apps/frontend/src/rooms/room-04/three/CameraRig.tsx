import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Vector3, type Group, type PerspectiveCamera } from 'three'
import { useKeyboardControls } from './useKeyboardControls'
import { sampleZoneGroundY } from './groundHeight'
import { play } from '../../../audio/sfx'

const GROUND_SAMPLE_INTERVAL = 1 / 12

const MOVE_SPEED = 5
const STRAFE_SPEED = 4
const X_BOUNDS: [number, number] = [-200, 200]
const CAMERA_OFFSET = new Vector3(0.65, 2.5, 4.0)

const DANGER_DECAY_PER_SECOND = 0.04
const BASE_FOV = 60
const FOV_DANGER_BOOST = 14
const SHAKE_MAX = 0.12
const BOOST_SPEED_MULTIPLIER = 1.6
const BOB_FREQUENCY = 8
const BOB_AMOUNT = 0.035

const JUMP_VELOCITY = 6.5
const GRAVITY = -18

const ORBIT_RADIUS = 3
const ORBIT_SPEED = 0.5
const ORBIT_LOW_HEIGHT = 1.5
const ORBIT_HIGH_HEIGHT = 6.5
const ORBIT_LOOP_DURATION = (2 * Math.PI) / ORBIT_SPEED
const ORBIT_RISE_DURATION = 4

const desiredCameraPos = new Vector3()
const lookTarget = new Vector3()

interface CameraRigProps {
  playerPos: React.MutableRefObject<Vector3>
  paused: React.MutableRefObject<boolean>
  minZ: number
  orbiting: boolean
  landscapeRef: React.MutableRefObject<Group | null>
  dangerRef: React.MutableRefObject<{ level: number }>
  boostRef: React.MutableRefObject<{ activeUntil: number }>
  movingRef: React.MutableRefObject<{ isMoving: boolean }>
}

export function CameraRig({
  playerPos,
  paused,
  minZ,
  orbiting,
  landscapeRef,
  dangerRef,
  boostRef,
  movingRef,
}: CameraRigProps) {
  const keys = useKeyboardControls()
  const cameraInitialized = useRef(false)
  const velocityY = useRef(0)
  const jumpOffset = useRef(0)
  const groundY = useRef(0)
  const timeSinceSample = useRef(Infinity)

  useFrame(({ camera, clock }, delta) => {
    dangerRef.current.level *= Math.pow(DANGER_DECAY_PER_SECOND, delta)

    if (!paused.current && !orbiting) {
      const boostMultiplier = clock.elapsedTime < boostRef.current.activeUntil ? BOOST_SPEED_MULTIPLIER : 1
      const moveSpeed = MOVE_SPEED * boostMultiplier
      const strafeSpeed = STRAFE_SPEED * boostMultiplier
      const { forward, back, left, right, jump } = keys.current
      movingRef.current.isMoving = forward || back || left || right
      if (forward) playerPos.current.z -= moveSpeed * delta
      if (back) playerPos.current.z += moveSpeed * delta
      if (left) playerPos.current.x -= strafeSpeed * delta
      if (right) playerPos.current.x += strafeSpeed * delta

      playerPos.current.z = Math.max(minZ, playerPos.current.z)
      playerPos.current.x = Math.min(X_BOUNDS[1], Math.max(X_BOUNDS[0], playerPos.current.x))

      if (jump && jumpOffset.current <= 0) velocityY.current = JUMP_VELOCITY
      velocityY.current += GRAVITY * delta
      const wasAirborne = jumpOffset.current > 0
      jumpOffset.current = Math.max(0, jumpOffset.current + velocityY.current * delta)
      if (jumpOffset.current <= 0) {
        velocityY.current = 0
        if (wasAirborne) play('boing')
      }

      timeSinceSample.current += delta
      if (timeSinceSample.current >= GROUND_SAMPLE_INTERVAL) {
        timeSinceSample.current = 0
        groundY.current = sampleZoneGroundY(landscapeRef.current, playerPos.current.x, playerPos.current.z) ?? 0
      }
      playerPos.current.y = groundY.current + jumpOffset.current
    } else {
      movingRef.current.isMoving = false
    }

    if (orbiting) {
      const angle = clock.elapsedTime * ORBIT_SPEED
      const riseProgress = Math.min(1, Math.max(0, (clock.elapsedTime - ORBIT_LOOP_DURATION) / ORBIT_RISE_DURATION))
      const height = ORBIT_LOW_HEIGHT + (ORBIT_HIGH_HEIGHT - ORBIT_LOW_HEIGHT) * riseProgress
      desiredCameraPos.set(
        playerPos.current.x + Math.sin(angle) * ORBIT_RADIUS,
        playerPos.current.y + height,
        playerPos.current.z + Math.cos(angle) * ORBIT_RADIUS,
      )
      camera.position.copy(desiredCameraPos)
      cameraInitialized.current = true
      lookTarget.set(playerPos.current.x, playerPos.current.y + 1.1, playerPos.current.z)
    } else {
      desiredCameraPos.set(
        playerPos.current.x + CAMERA_OFFSET.x,
        playerPos.current.y + CAMERA_OFFSET.y,
        playerPos.current.z + CAMERA_OFFSET.z,
      )

      if (!cameraInitialized.current) {
        camera.position.copy(desiredCameraPos)
        cameraInitialized.current = true
      } else {
        camera.position.lerp(desiredCameraPos, 1 - Math.pow(0.001, delta))
      }

      const danger = dangerRef.current.level
      if (danger > 0.001) {
        const shakeAmp = danger * SHAKE_MAX
        camera.position.x += Math.sin(clock.elapsedTime * 37) * shakeAmp
        camera.position.y += Math.sin(clock.elapsedTime * 53 + 1.7) * shakeAmp
      }

      if (movingRef.current.isMoving && !paused.current) {
        camera.position.y += Math.sin(clock.elapsedTime * BOB_FREQUENCY) * BOB_AMOUNT
        camera.position.x += Math.sin(clock.elapsedTime * BOB_FREQUENCY * 0.5) * BOB_AMOUNT * 0.4
      }

      const perspectiveCamera = camera as PerspectiveCamera
      if (perspectiveCamera.isPerspectiveCamera) {
        const targetFov = BASE_FOV + danger * FOV_DANGER_BOOST
        if (Math.abs(perspectiveCamera.fov - targetFov) > 0.01) {
          perspectiveCamera.fov += (targetFov - perspectiveCamera.fov) * Math.min(1, delta * 3)
          perspectiveCamera.updateProjectionMatrix()
        }
      }

      lookTarget.set(playerPos.current.x - 0.4, playerPos.current.y + 1.1, playerPos.current.z - 2)
    }

    camera.lookAt(lookTarget)
  })

  return null
}
