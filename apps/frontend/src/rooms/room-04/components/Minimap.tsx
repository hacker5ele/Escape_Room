import { useEffect, useRef } from 'react'
import type { Vector3 } from 'three'
import { VISIONS, WORLD, type VisionDef } from '../story'

const MAP_SIZE = 120
const DOT_SIZE = 8
const MARK_SIZE = 7
const THREAT_SIZE = 11
const RANGE_MARGIN = 16

function GuardianGlyph() {
  return (
    <svg viewBox="0 0 20 20" width="100%" height="100%">
      <path
        d="M10 2 L7 5 L4 6 Q2 9 3 13 Q4 17 10 18 Q16 17 17 13 Q18 9 16 6 L13 5 Z"
        fill="currentColor"
      />
      <path d="M6 6 L4 3 L7 5 Z" fill="currentColor" />
      <path d="M14 6 L16 3 L13 5 Z" fill="currentColor" />
      <circle cx="7.5" cy="10" r="1.1" fill="#1b1f27" />
      <circle cx="12.5" cy="10" r="1.1" fill="#1b1f27" />
    </svg>
  )
}

const visionXs = VISIONS.map((vision) => vision.x)
const visionZs = VISIONS.map((vision) => vision.z)
const X_RANGE = Math.max(...visionXs.map(Math.abs)) + RANGE_MARGIN
const Z_MAX = Math.max(WORLD.startZ, ...visionZs) + RANGE_MARGIN
const Z_MIN = Math.min(...visionZs) - RANGE_MARGIN

function toMapPx(x: number, z: number, dotSize: number) {
  const nx = Math.min(1, Math.max(0, (x + X_RANGE) / (X_RANGE * 2)))
  const nz = Math.min(1, Math.max(0, (z - Z_MIN) / (Z_MAX - Z_MIN)))
  return { left: nx * MAP_SIZE - dotSize / 2, top: nz * MAP_SIZE - dotSize / 2 }
}

interface MinimapProps {
  playerPos: React.MutableRefObject<Vector3>
  visionsSolved: Set<VisionDef['id']>
  guardianPositions: Vector3[]
  tutorial?: boolean
}

export function Minimap({ playerPos, visionsSolved, guardianPositions, tutorial }: MinimapProps) {
  const dotRef = useRef<HTMLDivElement>(null)
  const threatRefs = useRef<(HTMLDivElement | null)[]>([])

  useEffect(() => {
    let frame: number
    function tick() {
      if (dotRef.current) {
        const { left, top } = toMapPx(playerPos.current.x, playerPos.current.z, DOT_SIZE)
        dotRef.current.style.transform = `translate(${left}px, ${top}px)`
      }
      guardianPositions.forEach((pos, i) => {
        const el = threatRefs.current[i]
        if (!el) return
        const { left, top } = toMapPx(pos.x, pos.z, THREAT_SIZE)
        el.style.transform = `translate(${left}px, ${top}px)`
      })
      frame = requestAnimationFrame(tick)
    }
    tick()
    return () => cancelAnimationFrame(frame)
  }, [playerPos, guardianPositions])

  const threatCount = guardianPositions.length

  return (
    <div className="r4-minimap-wrap">
      <div
        className={`r4-minimap${tutorial ? ' r4-minimap-highlight' : ''}`}
        style={{ width: MAP_SIZE, height: MAP_SIZE }}
      >
        {VISIONS.map((vision) => {
          const solved = visionsSolved.has(vision.id)
          const locked = Boolean(vision.finalGate) && visionsSolved.size < VISIONS.length - 1
          if (locked) return null
          const { left, top } = toMapPx(vision.x, vision.z, MARK_SIZE)
          return (
            <div
              key={vision.id}
              className={`r4-minimap-box${solved ? ' r4-minimap-box-solved' : ''}`}
              style={{ transform: `translate(${left}px, ${top}px)`, background: solved ? '#555' : vision.color }}
            />
          )
        })}
        {Array.from({ length: threatCount }, (_, i) => (
          <div
            key={i}
            ref={(el) => {
              threatRefs.current[i] = el
            }}
            className="r4-minimap-threat"
          >
            <GuardianGlyph />
          </div>
        ))}
        <div ref={dotRef} className="r4-minimap-player" />
      </div>
      {tutorial && (
        <div className="r4-minimap-callout">
          <p>This is your map. Colored dots are boxes to find. Glowing shapes are danger. The red dot is you.</p>
        </div>
      )}
    </div>
  )
}
