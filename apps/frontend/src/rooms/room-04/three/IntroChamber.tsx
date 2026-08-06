import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { DoubleSide, type MeshBasicMaterial, type PointLight } from 'three'
import { WORLD } from '../story'

interface IntroChamberProps {
  opening: boolean
}

const CENTER_Z = WORLD.startZ
const HALF_W = 4
const HALF_D = 7
const HEIGHT = 8
const FADE_SPEED = 1 / 0.6

const WALL_SHADES = {
  front: '#f2f2f2',
  back: '#e3e3e3',
  left: '#eaeaea',
  right: '#eaeaea',
  top: '#fafafa',
  floor: '#d6d6d6',
} as const

function WallPlane({
  width,
  height,
  position,
  rotation,
  color,
  materialRef,
}: {
  width: number
  height: number
  position: [number, number, number]
  rotation?: [number, number, number]
  color: string
  materialRef: React.RefObject<MeshBasicMaterial | null>
}) {
  return (
    <mesh position={position} rotation={rotation}>
      <planeGeometry args={[width, height]} />
      <meshBasicMaterial ref={materialRef} color={color} side={DoubleSide} toneMapped={false} transparent />
    </mesh>
  )
}

export function IntroChamber({ opening }: IntroChamberProps) {
  const frontMat = useRef<MeshBasicMaterial>(null)
  const backMat = useRef<MeshBasicMaterial>(null)
  const leftMat = useRef<MeshBasicMaterial>(null)
  const rightMat = useRef<MeshBasicMaterial>(null)
  const topMat = useRef<MeshBasicMaterial>(null)
  const floorMat = useRef<MeshBasicMaterial>(null)
  const flashRef = useRef<PointLight>(null)
  const flashTriggered = useRef(false)

  const materials = [frontMat, backMat, leftMat, rightMat, topMat, floorMat]

  useFrame((_, delta) => {
    if (!opening) return
    for (const mat of materials) {
      if (mat.current) mat.current.opacity = Math.max(0, mat.current.opacity - delta * FADE_SPEED)
    }

    if (flashRef.current) {
      if (!flashTriggered.current) {
        flashRef.current.intensity = 14
        flashTriggered.current = true
      } else if (flashRef.current.intensity > 0.01) {
        flashRef.current.intensity *= Math.max(0, 1 - delta * 4)
      }
    }
  })

  return (
    <>
      <WallPlane
        width={HALF_W * 2}
        height={HEIGHT}
        position={[0, HEIGHT / 2, CENTER_Z - HALF_D]}
        color={WALL_SHADES.front}
        materialRef={frontMat}
      />
      <WallPlane
        width={HALF_W * 2}
        height={HEIGHT}
        position={[0, HEIGHT / 2, CENTER_Z + HALF_D]}
        rotation={[0, Math.PI, 0]}
        color={WALL_SHADES.back}
        materialRef={backMat}
      />
      <WallPlane
        width={HALF_D * 2}
        height={HEIGHT}
        position={[-HALF_W, HEIGHT / 2, CENTER_Z]}
        rotation={[0, Math.PI / 2, 0]}
        color={WALL_SHADES.left}
        materialRef={leftMat}
      />
      <WallPlane
        width={HALF_D * 2}
        height={HEIGHT}
        position={[HALF_W, HEIGHT / 2, CENTER_Z]}
        rotation={[0, -Math.PI / 2, 0]}
        color={WALL_SHADES.right}
        materialRef={rightMat}
      />
      <WallPlane
        width={HALF_W * 2}
        height={HALF_D * 2}
        position={[0, HEIGHT, CENTER_Z]}
        rotation={[Math.PI / 2, 0, 0]}
        color={WALL_SHADES.top}
        materialRef={topMat}
      />
      <WallPlane
        width={HALF_W * 2}
        height={HALF_D * 2}
        position={[0, 0.03, CENTER_Z]}
        rotation={[-Math.PI / 2, 0, 0]}
        color={WALL_SHADES.floor}
        materialRef={floorMat}
      />
      <pointLight position={[0, HEIGHT - 0.5, CENTER_Z]} intensity={4} color="#ffffff" />
      <pointLight position={[0, 1.2, CENTER_Z]} intensity={1.4} color="#ffffff" distance={6} />
      <pointLight ref={flashRef} position={[0, 3, CENTER_Z]} intensity={0} distance={20} color="#ffffff" />
    </>
  )
}
