import { Suspense, useEffect, useRef } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Fog, type Group, type Vector3 } from 'three'
import { VISIONS, WORLD, GUARDIAN_HOMES, pathCenterX, type VisionDef } from '../story'
import { Landscape } from './Landscape'
import { PowerPickups } from './PowerPickup'
import { VisionCube } from './VisionCube'
import { WizardBlocker } from './WizardBlocker'
import { ForestGuardian } from './ForestGuardian'
import { ProximityTrigger } from './ProximityTrigger'
import { CameraRig } from './CameraRig'
import { Character, type CharacterState } from './Character'
import { IntroChamber } from './IntroChamber'
import { Ascension } from './Ascension'

export interface RespawnRequest {
  x: number
  z: number
  nonce: number
}

const FOG_FAR_BASE = 48
const FOG_FAR_MIN = 26
const FOG_FAR_CHASE = 20

function TensionFog({ visionsSolvedCount, finaleActive }: { visionsSolvedCount: number; finaleActive: boolean }) {
  const { scene } = useThree()
  const targetFar = finaleActive
    ? FOG_FAR_CHASE
    : Math.max(FOG_FAR_MIN, FOG_FAR_BASE - visionsSolvedCount * 7)

  useFrame((_, delta) => {
    const fog = scene.fog as Fog | null
    if (!fog) return
    fog.far += (targetFar - fog.far) * Math.min(1, delta * 0.8)
  })

  return <fog attach="fog" args={['#232b30', 10, FOG_FAR_BASE]} />
}

interface RunnerSceneProps {
  playerPos: React.MutableRefObject<Vector3>
  paused: React.MutableRefObject<boolean>
  visionsSolved: Set<VisionDef['id']>
  wizardBanished: boolean
  finaleActive: boolean
  characterState: CharacterState
  introPhase: 'gate' | 'opening' | 'done'
  triggeringVisionId: VisionDef['id'] | null
  respawnRequest: RespawnRequest | null
  dangerRef: React.MutableRefObject<{ level: number }>
  boostRef: React.MutableRefObject<{ activeUntil: number }>
  guardianPositions: Vector3[]
  wizardPosition: Vector3
  movingRef: React.MutableRefObject<{ isMoving: boolean }>
  graceActive: React.MutableRefObject<boolean>
  ascending: boolean
  onReachVision: (vision: VisionDef) => void
  onReachWizard: () => void
  onReachDoor: () => void
  onGuardianCaught: () => void
  onPowerCollected: (elapsedTime: number) => void
}

export function RunnerScene({
  playerPos,
  paused,
  visionsSolved,
  wizardBanished,
  finaleActive,
  characterState,
  introPhase,
  triggeringVisionId,
  respawnRequest,
  dangerRef,
  boostRef,
  guardianPositions,
  wizardPosition,
  movingRef,
  graceActive,
  ascending,
  onReachVision,
  onReachWizard,
  onReachDoor,
  onGuardianCaught,
  onPowerCollected,
}: RunnerSceneProps) {
  const landscapeRef = useRef<Group>(null)
  const orbiting = introPhase === 'gate'

  useEffect(() => {
    if (!respawnRequest) return
    playerPos.current.x = respawnRequest.x
    playerPos.current.z = respawnRequest.z
  }, [respawnRequest, playerPos])

  return (
    <Canvas camera={{ fov: 60, near: 0.1, far: 600, position: [0, orbiting ? 1.5 : 2.6, WORLD.startZ + 3] }}>
      <color attach="background" args={['#232b30']} />
      <TensionFog visionsSolvedCount={visionsSolved.size} finaleActive={finaleActive} />
      <ambientLight intensity={0.36} color="#a9c0cc" />
      <directionalLight position={[20, 30, 10]} intensity={1.1} color="#ffd9a0" />
      <directionalLight position={[-15, 10, -20]} intensity={0.22} color="#5a72a0" />

      <Landscape ref={landscapeRef} hidden={introPhase === 'gate'} />
      {introPhase !== 'gate' && (
        <PowerPickups playerPos={playerPos} paused={paused} landscapeRef={landscapeRef} onCollect={onPowerCollected} />
      )}
      {introPhase !== 'done' && <IntroChamber opening={introPhase === 'opening'} />}

      <CameraRig
        playerPos={playerPos}
        paused={paused}
        minZ={WORLD.endZ}
        orbiting={orbiting}
        landscapeRef={landscapeRef}
        dangerRef={dangerRef}
        boostRef={boostRef}
        movingRef={movingRef}
        ascending={ascending}
      />

      <Suspense fallback={null}>
        <Character playerPos={playerPos} state={characterState} />
      </Suspense>

      {ascending && (
        <Suspense fallback={null}>
          <Ascension originX={playerPos.current.x} originY={playerPos.current.y} originZ={playerPos.current.z} />
        </Suspense>
      )}

      {VISIONS.map((vision) => (
        <Suspense key={vision.id} fallback={null}>
          <VisionCube
            vision={vision}
            playerPos={playerPos}
            solved={visionsSolved.has(vision.id)}
            triggering={triggeringVisionId === vision.id}
            locked={Boolean(vision.finalGate) && visionsSolved.size < VISIONS.length - 1}
            paused={paused}
            landscapeRef={landscapeRef}
            onReach={() => onReachVision(vision)}
          />
        </Suspense>
      ))}

      {GUARDIAN_HOMES.map((home, i) => (
        <Suspense key={i} fallback={null}>
          <ForestGuardian
            homeX={home.x}
            homeZ={home.z}
            playerPos={playerPos}
            paused={paused}
            active={introPhase === 'done' && !finaleActive}
            landscapeRef={landscapeRef}
            dangerRef={dangerRef}
            boostRef={boostRef}
            positionOut={guardianPositions[i]}
            movingRef={movingRef}
            graceActive={graceActive}
            onCaught={onGuardianCaught}
          />
        </Suspense>
      ))}

      <Suspense fallback={null}>
        <WizardBlocker
          playerPos={playerPos}
          banished={wizardBanished}
          paused={paused}
          landscapeRef={landscapeRef}
          finaleActive={finaleActive}
          dangerRef={dangerRef}
          positionOut={wizardPosition}
          onReach={onReachWizard}
        />
      </Suspense>

      <ProximityTrigger
        playerPos={playerPos}
        x={pathCenterX(WORLD.doorZ)}
        z={WORLD.doorZ}
        disabled={!wizardBanished}
        paused={paused}
        onTrigger={onReachDoor}
      />
    </Canvas>
  )
}
