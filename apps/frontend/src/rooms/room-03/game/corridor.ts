import { drawPlayer } from './creatures'

// The Sphinx corridor's own engine, together in one module: the chamber's
// fixed layout, the walk/camera simulation, the canvas renderer, and the
// wrong-answer fail sequence. Merged purely to cut down the room's file
// count — each section below owns its own concerns and could still be read
// (and was originally written) as a standalone file.

// ============================================================================
// World — the chamber's fixed layout: a wide world the player walks through
// left-to-right, with five riddle zones in sequence and a sealed door at the
// far end. All numbers are world-space pixels.
// ============================================================================

// 16:9, matching most browser windows — see CANVAS_WIDTH's own comment below.
// Every vertical constant below is the original 480-tall layout scaled by
// 1.5x (720/480), so proportions (ground level, headroom above it) match
// the old look exactly, just larger.
export const WORLD_HEIGHT = 720
export const GROUND_Y = 570
// The visible sprite (creatures.ts's drawPlayer) is drawn at its own fixed
// internal scale, independent of the room's height — these two only define
// the invisible collision/clamp box, so they don't need to track GROUND_Y.
export const PLAYER_WIDTH = 22
export const PLAYER_HEIGHT = 38
const PLAYER_SPEED = 220 // px/sec

export interface Zone {
  /** Index into the riddle list this zone triggers, 0-based. */
  riddleIndex: number
  /** Center of the light circle the player must stand inside to trigger the encounter. */
  centerX: number
  /** Radius of that circle, in world pixels. */
  radius: number
}

interface Pillar {
  x: number
  width: number
  height: number
}

const ZONE_SPACING = 700
const ENTRANCE_WIDTH = 380
const ZONE_RADIUS = 55

export const ZONES: readonly Zone[] = Array.from({ length: 5 }, (_, i) => ({
  riddleIndex: i,
  centerX: ENTRANCE_WIDTH + i * ZONE_SPACING + ZONE_RADIUS,
  radius: ZONE_RADIUS,
}))

const lastZone = ZONES[ZONES.length - 1]
const DOOR_X = (lastZone?.centerX ?? ENTRANCE_WIDTH) + ZONE_SPACING
const WORLD_WIDTH = DOOR_X + 350

/**
 * Background pillars — purely decorative atmosphere, not obstacles. Nothing
 * in this game collides with them; the only boundary is the world edge, so
 * the player is never trapped between "walk toward the Sphinx" and a wall.
 */
const PILLARS: readonly Pillar[] = Array.from({ length: 16 }, (_, i) => ({
  x: 120 + i * (WORLD_WIDTH / 16),
  width: 45,
  height: 300 + (i % 3) * 39,
}))

/**
 * Torch positions, independent of the riddle waypoints. One beside every
 * pillar (not just every other one), so the corridor is actually lit its
 * whole length instead of alternating between lit and dim stretches.
 */
const TORCH_POSITIONS: readonly number[] = PILLARS.map((pillar) => pillar.x + pillar.width + 26)

/**
 * Escalating atmosphere, keyed by how many riddles have been solved so far
 * (0 = before riddle 1, 5 = all solved). Matches the brief's table.
 */
export interface AtmosphereStage {
  skyTone: string
  floorTone: string
  sphinxPosture: 'reclined' | 'leaning' | 'upright' | 'looming'
  eyeGlow: string
  vignette: number // 0-1, how much darkness creeps in from the edges
}

const ATMOSPHERE: readonly AtmosphereStage[] = [
  { skyTone: '#1a1108', floorTone: '#2b1c10', sphinxPosture: 'reclined', eyeGlow: '#e8b04b', vignette: 0.15 },
  { skyTone: '#170f09', floorTone: '#271a0f', sphinxPosture: 'reclined', eyeGlow: '#e8b04b', vignette: 0.25 },
  { skyTone: '#0e1015', floorTone: '#1c1a16', sphinxPosture: 'leaning', eyeGlow: '#8fb0e8', vignette: 0.4 },
  { skyTone: '#07080b', floorTone: '#12100c', sphinxPosture: 'upright', eyeGlow: '#cfe0ff', vignette: 0.6 },
  { skyTone: '#020203', floorTone: '#0a0806', sphinxPosture: 'looming', eyeGlow: '#ffffff', vignette: 0.8 },
]

const FALLBACK_ATMOSPHERE: AtmosphereStage = {
  skyTone: '#1a1108',
  floorTone: '#2b1c10',
  sphinxPosture: 'reclined',
  eyeGlow: '#e8b04b',
  vignette: 0.15,
}

function atmosphereFor(solvedCount: number): AtmosphereStage {
  const clamped = Math.max(0, Math.min(ATMOSPHERE.length - 1, solvedCount))
  return ATMOSPHERE[clamped] ?? FALLBACK_ATMOSPHERE
}

// ============================================================================
// Engine — the walk/camera simulation. Movement is disabled outside the
// 'explore' phase; the encounter overlay owns input then.
// ============================================================================

export interface PlayerState {
  x: number
  facing: 1 | -1
  walking: boolean
}

export type GamePhase = 'explore' | 'riddle' | 'attack' | 'ending'

export interface EngineState {
  player: PlayerState
  cameraX: number
  phase: GamePhase
  /** Riddle indices the player has answered correctly this run. */
  solvedZones: Set<number>
  /** Zone currently active during 'riddle' / 'attack', or null. */
  activeZoneIndex: number | null
}

export function createInitialState(): EngineState {
  return {
    player: { x: 80, facing: 1, walking: false },
    cameraX: 0,
    phase: 'explore',
    solvedZones: new Set(),
    activeZoneIndex: null,
  }
}

/**
 * The world's only boundary is its edges. The Sphinx does not appear in the
 * corridor at all — it only appears once, standing in the ending chamber
 * after every riddle is solved (see scenes.ts) — so there is nothing left
 * physically blocking the walk to the door.
 */
function clampToWorld(x: number): number {
  const min = PLAYER_WIDTH / 2
  const max = WORLD_WIDTH - PLAYER_WIDTH / 2
  return Math.max(min, Math.min(max, x))
}

export interface KeysDown {
  left: boolean
  right: boolean
}

export type UpdateSignal = { kind: 'zone'; riddleIndex: number } | { kind: 'door' } | null

const DOOR_TRIGGER_RADIUS = 40

/**
 * Advances the simulation by `dtMs`. Movement is disabled outside the
 * 'explore' phase — the encounter overlay owns input then. Returns a signal
 * for whatever the player just walked into this tick: a riddle zone's light
 * circle, or (once every riddle is solved) the door at the end of the
 * corridor — so the caller can trigger the matching dialogue or the
 * transition into the ending chamber.
 */
export function update(state: EngineState, keys: KeysDown, dtMs: number): UpdateSignal {
  if (state.phase !== 'explore') {
    state.player.walking = false
    return null
  }

  const dt = dtMs / 1000
  const direction = (keys.right ? 1 : 0) - (keys.left ? 1 : 0)

  state.player.walking = direction !== 0
  if (direction !== 0) state.player.facing = direction > 0 ? 1 : -1

  const proposed = state.player.x + direction * PLAYER_SPEED * dt
  state.player.x = clampToWorld(proposed)

  state.cameraX = Math.max(0, Math.min(WORLD_WIDTH - CANVAS_WIDTH, state.player.x - CANVAS_WIDTH / 2))

  for (const zone of ZONES) {
    if (state.solvedZones.has(zone.riddleIndex)) continue
    if (Math.abs(state.player.x - zone.centerX) < zone.radius) {
      return { kind: 'zone', riddleIndex: zone.riddleIndex }
    }
  }

  if (state.solvedZones.size >= ZONES.length && Math.abs(state.player.x - DOOR_X) < DOOR_TRIGGER_RADIUS) {
    return { kind: 'door' }
  }

  return null
}

// ============================================================================
// Render — the canvas drawing: parallax pillars, torches, the light-circle
// waypoints, the player, and an escalating vignette.
// ============================================================================

// Widescreen (1280x480) rather than the original 800x480 — the chamber is a
// fixed full-viewport takeover (see .sphinx-chamber), and most screens are
// much wider than 5:3, so a narrower internal canvas just left black bars on
// either side under object-fit: contain. The world itself already scrolls
// with the camera, so widening this constant alone reveals more of the same
// corridor per frame; nothing about the world layout needs to move.
export const CANVAS_WIDTH = 1280
export const CANVAS_HEIGHT = WORLD_HEIGHT

/**
 * A wall-mounted torch: bracket, a bright core flame, and a wide firelight
 * spill onto the floor and wall around it. Sized and lit to actually read
 * against the pyramid backdrop — the flame itself is the brightest thing
 * in the scene wherever it appears, not a faint accent easily lost next to
 * other glows (like the riddle waypoints).
 */
function drawTorch(ctx: CanvasRenderingContext2D, x: number, y: number, lit: boolean, time: number) {
  // Wall bracket the torch sits in.
  ctx.fillStyle = '#4a3520'
  ctx.beginPath()
  ctx.moveTo(x - 7, y + 36)
  ctx.lineTo(x + 7, y + 36)
  ctx.lineTo(x + 3, y + 8)
  ctx.lineTo(x - 3, y + 8)
  ctx.closePath()
  ctx.fill()

  if (!lit) return

  const flicker = 1 + Math.sin(time / 130 + x) * 0.12 + Math.sin(time / 43 + x * 3) * 0.05

  // Wide, strong firelight spill onto the floor and nearby wall — this is
  // what makes the torch read as an actual light source in the room, not
  // just a small bright dot. The fill rect is deliberately larger than the
  // gradient's own max radius (190 * flicker's peak of ~1.17 ≈ 222) — too
  // tight a rect clips the gradient before it reaches its own zero-alpha
  // stop, which reads as a hard-edged glowing rectangle instead of a soft
  // falloff.
  const spillRadius = 190 * flicker
  const spill = ctx.createRadialGradient(x, y + 4, 6, x, y + 4, spillRadius)
  spill.addColorStop(0, 'rgba(255, 170, 70, 0.4)')
  spill.addColorStop(0.5, 'rgba(255, 130, 45, 0.18)')
  spill.addColorStop(1, 'rgba(255, 130, 45, 0)')
  ctx.fillStyle = spill
  const spillBox = spillRadius + 20
  ctx.fillRect(x - spillBox, y + 4 - spillBox, spillBox * 2, spillBox * 2)

  // A warm pool of light directly on the floor beneath the torch, visible
  // even past where the general spill has faded — this is what actually
  // makes the ground itself look lit, not just the air around the flame.
  const floorPool = ctx.createRadialGradient(x, GROUND_Y - 4, 4, x, GROUND_Y - 4, 70 * flicker)
  floorPool.addColorStop(0, 'rgba(255, 150, 60, 0.3)')
  floorPool.addColorStop(1, 'rgba(255, 150, 60, 0)')
  ctx.fillStyle = floorPool
  ctx.beginPath()
  ctx.ellipse(x, GROUND_Y - 4, 70 * flicker, 16, 0, 0, Math.PI * 2)
  ctx.fill()

  // The flame's own glow — large and saturated.
  const glow = ctx.createRadialGradient(x, y - 4, 2, x, y - 4, 34 * flicker)
  glow.addColorStop(0, 'rgba(255, 220, 140, 1)')
  glow.addColorStop(0.4, 'rgba(255, 170, 60, 0.85)')
  glow.addColorStop(1, 'rgba(255, 120, 30, 0)')
  ctx.fillStyle = glow
  ctx.beginPath()
  ctx.arc(x, y - 4, 34 * flicker, 0, Math.PI * 2)
  ctx.fill()

  // The flame shape itself, layered light-to-dark for a hot core.
  ctx.fillStyle = '#ff9c3e'
  ctx.beginPath()
  ctx.ellipse(x, y - 4, 6 * flicker, 15 * flicker, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#ffd27a'
  ctx.beginPath()
  ctx.ellipse(x, y - 6, 4 * flicker, 10 * flicker, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#fff3d6'
  ctx.beginPath()
  ctx.ellipse(x, y - 8, 2 * flicker, 5 * flicker, 0, 0, Math.PI * 2)
  ctx.fill()
}

/**
 * The actual trigger zone, drawn as a literal circle of light on the floor —
 * this is what the player walks into, not an invisible strip. `active`
 * (player currently standing inside it) brightens and tightens the glow so
 * "you are in it" is unambiguous.
 */
function drawLightCircle(
  ctx: CanvasRenderingContext2D,
  x: number,
  groundY: number,
  radius: number,
  label: number,
  active: boolean,
  time: number,
) {
  const pulse = 0.6 + Math.sin(time / 340 + x) * 0.2
  const intensity = active ? 1 : pulse

  ctx.save()
  ctx.translate(x, groundY)

  // The floor glow itself — an ellipse to read as lying flat on the ground.
  const floorGlow = ctx.createRadialGradient(0, 0, 2, 0, 0, radius)
  floorGlow.addColorStop(0, `rgba(232, 176, 75, ${0.55 * intensity})`)
  floorGlow.addColorStop(0.7, `rgba(232, 176, 75, ${0.22 * intensity})`)
  floorGlow.addColorStop(1, 'rgba(232, 176, 75, 0)')
  ctx.fillStyle = floorGlow
  ctx.beginPath()
  ctx.ellipse(0, 0, radius, radius * 0.34, 0, 0, Math.PI * 2)
  ctx.fill()

  // Ring outline so the circle's edge is crisp even where the fill is faint.
  ctx.strokeStyle = `rgba(245, 217, 154, ${(active ? 0.9 : 0.45) * intensity})`
  ctx.lineWidth = active ? 2.5 : 1.5
  ctx.beginPath()
  ctx.ellipse(0, 0, radius, radius * 0.34, 0, 0, Math.PI * 2)
  ctx.stroke()

  // A floating hieroglyph-style number tile above the circle, matching the HUD icons.
  const bob = Math.sin(time / 500 + x) * 4
  const markerY = -58 + bob
  ctx.fillStyle = '#1c140c'
  ctx.beginPath()
  ctx.roundRect(-11, markerY - 11, 22, 22, 4)
  ctx.fill()
  ctx.strokeStyle = `rgba(232, 176, 75, ${0.8 * intensity})`
  ctx.lineWidth = 1.5
  ctx.stroke()

  ctx.fillStyle = '#f5d99a'
  ctx.font = 'bold 11px ui-monospace, Consolas, monospace'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(String(label), 0, markerY + 1)

  ctx.restore()
}

/** A pillar carved with hieroglyph-like horizontal registers, pyramid-interior style. */
function drawPillar(ctx: CanvasRenderingContext2D, screenX: number, width: number, height: number, tone: string) {
  ctx.fillStyle = tone
  ctx.fillRect(screenX, GROUND_Y - height, width, height)

  // Carved register lines — small horizontal bands, evenly spaced, reading
  // as glyph rows without drawing actual symbols.
  ctx.strokeStyle = 'rgba(0,0,0,0.3)'
  ctx.lineWidth = 1
  const bands = Math.floor(height / 26)
  for (let i = 1; i < bands; i++) {
    const y = GROUND_Y - i * 26
    ctx.beginPath()
    ctx.moveTo(screenX + 2, y)
    ctx.lineTo(screenX + width - 2, y)
    ctx.stroke()
  }

  // Capital.
  ctx.fillStyle = 'rgba(0,0,0,0.25)'
  ctx.fillRect(screenX - 3, GROUND_Y - height, width + 6, 6)
}

export function render(
  ctx: CanvasRenderingContext2D,
  state: EngineState,
  timeMs: number,
  doorLit: boolean,
): void {
  const atmosphere = atmosphereFor(state.solvedZones.size)
  const cam = state.cameraX

  ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)

  // Sky/upper chamber — a pyramid's interior narrows toward the top, so the
  // upper half is darker and slightly warmer near the torch band.
  const sky = ctx.createLinearGradient(0, 0, 0, GROUND_Y)
  sky.addColorStop(0, atmosphere.skyTone)
  sky.addColorStop(0.6, atmosphere.skyTone)
  sky.addColorStop(1, atmosphere.floorTone)
  ctx.fillStyle = sky
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)

  // Far pillars — parallax at 0.4x camera speed.
  const parallaxOffset = cam * 0.4
  for (const pillar of PILLARS) {
    const screenX = pillar.x - parallaxOffset
    if (screenX < -60 || screenX > CANVAS_WIDTH + 60) continue
    drawPillar(ctx, screenX, pillar.width, pillar.height, 'rgba(30, 22, 14, 0.65)')
  }

  // Floor — a soft vertical gradient rather than one flat dark fill, so it
  // picks up warmth near the torch band above it instead of reading as a
  // uniform slab under everything else's light.
  const floorGradient = ctx.createLinearGradient(0, GROUND_Y, 0, CANVAS_HEIGHT)
  floorGradient.addColorStop(0, atmosphere.floorTone)
  floorGradient.addColorStop(1, 'rgba(0,0,0,0.35)')
  ctx.fillStyle = floorGradient
  ctx.fillRect(0, GROUND_Y, CANVAS_WIDTH, CANVAS_HEIGHT - GROUND_Y)
  ctx.fillStyle = 'rgba(0,0,0,0.25)'
  ctx.fillRect(0, GROUND_Y, CANVAS_WIDTH, 4)

  // Faint floor seams for texture, receding toward the vanishing point.
  ctx.strokeStyle = 'rgba(0,0,0,0.15)'
  ctx.lineWidth = 1
  for (let i = 0; i < 6; i++) {
    const y = GROUND_Y + 12 + i * 14
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(CANVAS_WIDTH, y)
    ctx.stroke()
  }

  // Near pillars — full camera speed, drawn over the floor edge like real foreground.
  for (const pillar of PILLARS) {
    const screenX = pillar.x - cam
    if (screenX < -60 || screenX > CANVAS_WIDTH + 60) continue
    drawPillar(ctx, screenX, pillar.width, pillar.height, '#241a10')
  }

  // Torches line the whole corridor and stay lit end to end — the path
  // must always be visible. The escalating dread as riddles are solved
  // comes entirely from the vignette darkening, the cooling sky tone, and
  // the Sphinx's eye-glow color (all still driven by `atmosphere` below);
  // it no longer works by literally extinguishing the light source, which
  // left riddles 4-5's stretch of corridor unnavigable.
  TORCH_POSITIONS.forEach((torchX) => {
    const screenX = torchX - cam
    if (screenX < -180 || screenX > CANVAS_WIDTH + 180) return
    drawTorch(ctx, screenX, GROUND_Y - 90, true, timeMs)
  })

  // The sealed door at the far end.
  const doorScreenX = DOOR_X - cam
  if (doorScreenX > -80 && doorScreenX < CANVAS_WIDTH + 80) {
    ctx.fillStyle = '#150f09'
    ctx.fillRect(doorScreenX - 30, GROUND_Y - 160, 60, 160)
    ctx.strokeStyle = doorLit ? 'rgba(232, 176, 75, 0.8)' : 'rgba(232, 176, 75, 0.25)'
    ctx.lineWidth = 2
    ctx.strokeRect(doorScreenX - 30, GROUND_Y - 160, 60, 160)
    ctx.beginPath()
    ctx.moveTo(doorScreenX, GROUND_Y - 160)
    ctx.lineTo(doorScreenX, GROUND_Y)
    ctx.stroke()
  }

  // Five light-circle waypoints lead up to the sealed door — each one is
  // the actual trigger area for that riddle, not an invisible strip.
  ZONES.forEach((zone, i) => {
    const screenX = zone.centerX - cam
    if (screenX < -80 || screenX > CANVAS_WIDTH + 80) return
    if (state.solvedZones.has(zone.riddleIndex)) return

    const standingInside = Math.abs(state.player.x - zone.centerX) < zone.radius
    drawLightCircle(ctx, screenX, GROUND_Y - 4, zone.radius, i + 1, standingInside, timeMs)
  })

  // The player.
  if (state.phase !== 'attack') {
    drawPlayer(ctx, state.player.x - cam, GROUND_Y, state.player.facing, state.player.walking, timeMs)
  }

  // Vignette — darkens toward the edges, deepening as the run progresses.
  if (atmosphere.vignette > 0) {
    const vignette = ctx.createRadialGradient(
      CANVAS_WIDTH / 2,
      CANVAS_HEIGHT / 2,
      CANVAS_HEIGHT * 0.3,
      CANVAS_WIDTH / 2,
      CANVAS_HEIGHT / 2,
      CANVAS_HEIGHT * 0.75,
    )
    vignette.addColorStop(0, 'rgba(0,0,0,0)')
    vignette.addColorStop(1, `rgba(0,0,0,${atmosphere.vignette})`)
    ctx.fillStyle = vignette
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)
  }
}

// ============================================================================
// Attack — the fail sequence, drawn as an overlay on top of whatever the
// normal scene render produced.
// ============================================================================

/**
 * The fail sequence, drawn as an overlay on top of whatever the normal scene
 * render produced. `progress` is 0 at the instant of the wrong answer and 1
 * at the moment the screen is fully black — the caller advances it once per
 * frame against a fixed duration.
 *
 * Beats, in order: a silent freeze, torches already gone (handled by the
 * atmosphere/torch draw above not being called for the 'attack' phase),
 * sand rising from the floor, screen going fully black.
 */
export function drawAttack(ctx: CanvasRenderingContext2D, progress: number, shakeX: number, shakeY: number): void {
  ctx.save()
  ctx.translate(shakeX, shakeY)

  // Sand rises from the bottom, covering more of the screen as progress advances.
  const sandTop = CANVAS_HEIGHT * (1 - Math.min(1, progress * 1.3))
  const sandGradient = ctx.createLinearGradient(0, sandTop, 0, CANVAS_HEIGHT)
  sandGradient.addColorStop(0, 'rgba(30, 18, 10, 0.4)')
  sandGradient.addColorStop(1, 'rgba(10, 6, 4, 1)')
  ctx.fillStyle = sandGradient
  ctx.fillRect(0, sandTop, CANVAS_WIDTH, CANVAS_HEIGHT - sandTop)

  // Once sand has fully risen, fade the remaining gap to black.
  if (progress > 0.75) {
    const blackout = Math.min(1, (progress - 0.75) / 0.25)
    ctx.fillStyle = `rgba(0,0,0,${blackout})`
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)
  }

  ctx.restore()
}

/** Small deterministic-ish jitter for the screen-shake wrapper, seeded by frame count. */
export function shakeOffset(frame: number, intensity: number): { x: number; y: number } {
  if (intensity <= 0) return { x: 0, y: 0 }
  const x = (Math.sin(frame * 12.9898) * 43758.5453 % 1) * intensity * 2 - intensity
  const y = (Math.sin(frame * 78.233) * 43758.5453 % 1) * intensity * 2 - intensity
  return { x, y }
}
