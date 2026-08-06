// All of room-03's non-corridor scenes, together in one module: the ending
// chamber, the Atlantis quest, Poseidon's throne room, the Olympus carpet
// race, and the closing waiting room. Each keeps its own section below
// (own constants, own private draw helpers, own exported state/render
// functions) — merged into one file purely to cut down the room's file
// count, not because the scenes share any logic. The corridor itself
// (world.ts, engine.ts, render.ts, creatures.ts, attack.ts) stays split out,
// since those pieces are genuinely reused across scenes (e.g. drawPlayer,
// drawSphinx) or driven by their own game loop.

import { drawSphinx, GOLD_SPHINX_PALETTE } from './creatures'

// ============================================================================
// The ending chamber — white tile, blue flame, gold trim. Reached once the
// Sphinx's five riddles are solved; the Sphinx appears here to congratulate
// the player before the golden door to Atlantis opens.
// ============================================================================

// 16:9, matching the corridor's own widescreen bump — see world.ts.
export const ENDING_CANVAS_WIDTH = 1280
export const ENDING_CANVAS_HEIGHT = 720
export const ENDING_GROUND_Y = 570

/**
 * A blue flame — the color signals "this is not the same fire as the
 * corridor torches," same shape language (bracket, glow, layered core) so
 * it still reads as a torch, not a new kind of object.
 */
function drawBlueFlame(ctx: CanvasRenderingContext2D, x: number, y: number, time: number) {
  ctx.fillStyle = '#d4c98a'
  ctx.beginPath()
  ctx.moveTo(x - 6, y + 30)
  ctx.lineTo(x + 6, y + 30)
  ctx.lineTo(x + 3, y + 6)
  ctx.lineTo(x - 3, y + 6)
  ctx.closePath()
  ctx.fill()

  const flicker = 1 + Math.sin(time / 140 + x) * 0.12 + Math.sin(time / 50 + x * 3) * 0.05

  // The rect this gradient fills into must be generously larger than the
  // gradient's own max radius, or it clips the glow before the gradient
  // reaches its own zero-alpha stop — that reads as a hard glowing edge
  // ("the light just stops at a line") rather than a soft falloff.
  const spillRadius = 170 * flicker
  const spill = ctx.createRadialGradient(x, y, 6, x, y, spillRadius)
  spill.addColorStop(0, 'rgba(90, 170, 255, 0.35)')
  spill.addColorStop(0.5, 'rgba(70, 140, 255, 0.14)')
  spill.addColorStop(1, 'rgba(70, 140, 255, 0)')
  ctx.fillStyle = spill
  const spillBox = spillRadius + 20
  ctx.fillRect(x - spillBox, y - spillBox, spillBox * 2, spillBox * 2)

  const glow = ctx.createRadialGradient(x, y - 4, 2, x, y - 4, 32 * flicker)
  glow.addColorStop(0, 'rgba(210, 235, 255, 1)')
  glow.addColorStop(0.4, 'rgba(110, 180, 255, 0.9)')
  glow.addColorStop(1, 'rgba(60, 120, 255, 0)')
  ctx.fillStyle = glow
  ctx.beginPath()
  ctx.arc(x, y - 4, 32 * flicker, 0, Math.PI * 2)
  ctx.fill()

  ctx.fillStyle = '#3f7fff'
  ctx.beginPath()
  ctx.ellipse(x, y - 4, 5 * flicker, 14 * flicker, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#8ec4ff'
  ctx.beginPath()
  ctx.ellipse(x, y - 6, 3.5 * flicker, 9 * flicker, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#eaf5ff'
  ctx.beginPath()
  ctx.ellipse(x, y - 8, 1.6 * flicker, 4 * flicker, 0, 0, Math.PI * 2)
  ctx.fill()
}

/** A gold-veined white tile, laid in a simple grid across the floor. */
function drawTile(ctx: CanvasRenderingContext2D, x: number, width: number) {
  ctx.fillStyle = '#e9e4d8'
  ctx.fillRect(x, ENDING_GROUND_Y, width, ENDING_CANVAS_HEIGHT - ENDING_GROUND_Y)
  ctx.strokeStyle = 'rgba(201, 168, 76, 0.5)'
  ctx.lineWidth = 1.5
  ctx.strokeRect(x, ENDING_GROUND_Y, width, ENDING_CANVAS_HEIGHT - ENDING_GROUND_Y)
}

/** A gold-capped white pillar, matching the room's palette. */
function drawGoldPillar(ctx: CanvasRenderingContext2D, x: number, width: number, height: number) {
  ctx.fillStyle = '#f2eee2'
  ctx.fillRect(x, ENDING_GROUND_Y - height, width, height)
  ctx.strokeStyle = 'rgba(201, 168, 76, 0.35)'
  ctx.lineWidth = 1
  ctx.strokeRect(x, ENDING_GROUND_Y - height, width, height)

  ctx.fillStyle = '#d9ab4a'
  ctx.fillRect(x - 3, ENDING_GROUND_Y - height, width + 6, 6)
  ctx.fillRect(x - 3, ENDING_GROUND_Y - 6, width + 6, 6)
}

export interface EndingSceneState {
  /** Where the player stands, in this scene's own small coordinate space. */
  playerX: number
  facing: 1 | -1
  walking: boolean
  /** 0 = Sphinx not yet present, 1 = fully materialized. */
  sphinxAppear: number
  /** 0 = corridor golden door not yet lit, 1 = fully blazing. */
  doorGlow: number
  /** 0-1: the whiteout/flash consuming the screen on exit. */
  exitFlash: number
}

export function createEndingSceneState(): EndingSceneState {
  return { playerX: 260, facing: -1, walking: false, sphinxAppear: 0, doorGlow: 0, exitFlash: 0 }
}

/**
 * The ending chamber: white tile, blue flame, gold trim — a deliberate
 * contrast with the sand-and-amber corridor, so stepping through the door
 * reads as arriving somewhere new rather than a recolored version of the
 * same room. The Sphinx stands facing the player here (sphinxAppear fades
 * it in), and a golden door glows at the far side once the congratulations
 * beat is done, ready for the exit sequence.
 */
export function renderEndingScene(ctx: CanvasRenderingContext2D, state: EndingSceneState, time: number): void {
  ctx.clearRect(0, 0, ENDING_CANVAS_WIDTH, ENDING_CANVAS_HEIGHT)

  const sky = ctx.createLinearGradient(0, 0, 0, ENDING_GROUND_Y)
  sky.addColorStop(0, '#e9e6f2')
  sky.addColorStop(1, '#cfd0e0')
  ctx.fillStyle = sky
  ctx.fillRect(0, 0, ENDING_CANVAS_WIDTH, ENDING_CANVAS_HEIGHT)

  // Gold pillars flank the chamber, evenly spaced — positions scaled up from
  // the original 800-wide layout by the same 1.6x as the canvas itself, so
  // the proportions (margins, the gap around the door) stay the same.
  const pillarPositions = [96, 352, 928, 1184]
  for (const x of pillarPositions) {
    drawGoldPillar(ctx, x, 34, 360)
  }

  // Tiled floor, laid in a visible grid.
  const tileWidth = 80
  for (let x = 0; x < ENDING_CANVAS_WIDTH; x += tileWidth) {
    drawTile(ctx, x, tileWidth)
  }

  // Blue flames beside each pillar.
  for (const x of pillarPositions) {
    drawBlueFlame(ctx, x + 17, ENDING_GROUND_Y - 90, time)
  }

  // The golden door on the far wall, brightening as doorGlow rises.
  const doorX = ENDING_CANVAS_WIDTH / 2
  ctx.save()
  const doorGradient = ctx.createLinearGradient(doorX - 60, ENDING_GROUND_Y - 285, doorX + 60, ENDING_GROUND_Y)
  doorGradient.addColorStop(0, `rgba(255, 224, 130, ${0.3 + state.doorGlow * 0.6})`)
  doorGradient.addColorStop(1, `rgba(255, 200, 80, ${0.5 + state.doorGlow * 0.5})`)
  ctx.fillStyle = doorGradient
  ctx.fillRect(doorX - 60, ENDING_GROUND_Y - 285, 120, 285)

  if (state.doorGlow > 0) {
    const doorGlowGradient = ctx.createRadialGradient(doorX, ENDING_GROUND_Y - 143, 6, doorX, ENDING_GROUND_Y - 143, 330 * state.doorGlow)
    doorGlowGradient.addColorStop(0, `rgba(255, 235, 170, ${0.55 * state.doorGlow})`)
    doorGlowGradient.addColorStop(1, 'rgba(255, 235, 170, 0)')
    ctx.fillStyle = doorGlowGradient
    ctx.fillRect(doorX - 390, ENDING_GROUND_Y - 480, 780, 600)
  }

  ctx.strokeStyle = '#c9a84c'
  ctx.lineWidth = 3
  ctx.strokeRect(doorX - 60, ENDING_GROUND_Y - 285, 120, 285)
  ctx.restore()

  // The Sphinx, fading and rising into place — golden palette, facing the
  // player. sphinxAppear also lifts it slightly out of the floor on the way
  // in, a small settle rather than an instant pop.
  if (state.sphinxAppear > 0) {
    ctx.save()
    ctx.globalAlpha = Math.min(1, state.sphinxAppear * 1.4)
    const settle = (1 - state.sphinxAppear) * 40
    drawSphinx(ctx, doorX, ENDING_GROUND_Y + settle, 'upright', '#fff6da', true, time, GOLD_SPHINX_PALETTE)
    ctx.restore()
  }

  // The player, imported lazily by the caller via drawPlayer — kept out of
  // this module to avoid a circular import, so SphinxGame.tsx draws it.

  // Exit flash — a full whiteout that consumes the screen as the player
  // steps into the golden light.
  if (state.exitFlash > 0) {
    ctx.fillStyle = `rgba(255, 250, 230, ${state.exitFlash})`
    ctx.fillRect(0, 0, ENDING_CANVAS_WIDTH, ENDING_CANVAS_HEIGHT)
  }
}

// ============================================================================
// Atlantis — Poseidon's palace. Reached through the ending chamber's golden
// door. The player finds three hidden artifacts and returns each to its own
// pedestal, against a countdown clock — entirely client-side (ADR-0066,
// ADR-0070), since nothing about "did you find and place three artifacts"
// needs server verification.
// ============================================================================

// 16:9, matching the corridor's own widescreen bump — see world.ts.
export const ATLANTIS_CANVAS_WIDTH = 1280
export const ATLANTIS_CANVAS_HEIGHT = 720
const ATLANTIS_GROUND_Y = 570
const ATLANTIS_WORLD_WIDTH = 2200

export type ArtifactId = 'trident' | 'shell' | 'crown'

export interface Artifact {
  id: ArtifactId
  name: string
  /** Where it's hidden in the palace, world-space. */
  hideX: number
  hideY: number
  /** Its matching pedestal, world-space. */
  pedestalX: number
}

// Statues stand at these world-x positions — chosen to fall in a column's
// own gap (columns are every 220px starting at 60, so wx % 220 === 170
// lands squarely between two of them, never overlapping one). Each artifact
// hides directly behind its nearest statue, a real hiding spot instead of
// sitting exposed in the open — STATUE_POSITIONS is exported so the render
// loop below and the artifact placements here can't drift apart.
export const STATUE_POSITIONS: readonly number[] = [390, 830, 1270, 1710, 2150]

// Pedestal positions — the other set of column-gap centers not already
// taken by a statue (170, 610, 1050, 1490, 1930), so a pedestal never
// overlaps a column or a statue either.
/** Poseidon's three missing artifacts — each tucked behind a statue, each with one correct pedestal. */
export const ARTIFACTS: readonly Artifact[] = [
  { id: 'trident', name: "Poseidon's Trident", hideX: 390, hideY: ATLANTIS_GROUND_Y - 20, pedestalX: 1050 },
  { id: 'shell', name: 'The Golden Conch', hideX: 1270, hideY: ATLANTIS_GROUND_Y - 24, pedestalX: 610 },
  { id: 'crown', name: 'The Pearl Crown', hideX: 1710, hideY: ATLANTIS_GROUND_Y - 18, pedestalX: 1930 },
]

export const ATLANTIS_QUEST_TIME_MS = 60000
export const WRONG_PLACEMENT_PENALTY_MS = 10000
const FIND_RADIUS = 28
const PLACE_RADIUS = 30

export type ArtifactState = 'hidden' | 'found' | 'placed'

export interface AtlantisQuestState {
  artifactStates: Record<ArtifactId, ArtifactState>
  /** The artifact currently being carried, or null if empty-handed. */
  carrying: ArtifactId | null
  timeLeftMs: number
  /** Set briefly after a wrong placement, so the UI can flash feedback. */
  lastWrongPlacement: number | null
}

export function createAtlantisQuestState(): AtlantisQuestState {
  return {
    artifactStates: { trident: 'hidden', shell: 'hidden', crown: 'hidden' },
    carrying: null,
    timeLeftMs: ATLANTIS_QUEST_TIME_MS,
    lastWrongPlacement: null,
  }
}

export function isQuestComplete(state: AtlantisQuestState): boolean {
  return ARTIFACTS.every((a) => state.artifactStates[a.id] === 'placed')
}

/**
 * Attempts to find (pick up) whichever hidden artifact the player is
 * standing near, or place the carried one at a nearby pedestal. Only one of
 * the two can happen per click — you either pick something up or set
 * something down. Returns what happened, so the caller can drive feedback
 * (a wrong-pedestal flash, the time penalty) without re-deriving it.
 */
export type InteractionResult =
  | { kind: 'found'; id: ArtifactId }
  | { kind: 'placed-correct'; id: ArtifactId }
  | { kind: 'placed-wrong'; id: ArtifactId }
  | { kind: 'none' }

export function tryInteract(state: AtlantisQuestState, playerX: number): InteractionResult {
  if (state.carrying) {
    const carried = ARTIFACTS.find((a) => a.id === state.carrying)
    if (!carried) return { kind: 'none' }

    // Check every pedestal within reach — placing works at any pedestal,
    // right or wrong, so a wrong guess is a real, checkable mistake rather
    // than something the game silently prevents.
    for (const artifact of ARTIFACTS) {
      if (Math.abs(playerX - artifact.pedestalX) > PLACE_RADIUS) continue
      if (artifact.id === carried.id) {
        state.artifactStates[carried.id] = 'placed'
        state.carrying = null
        return { kind: 'placed-correct', id: carried.id }
      }
      // Wrong pedestal — the carried artifact goes all the way back to
      // "hidden" at its original spot, so it has to be found again rather
      // than vanishing (it was previously left in a 'found' limbo state
      // that neither the pickup loop nor the pedestal-glyph loop draws or
      // makes pickable again — the item was effectively lost for the rest
      // of the run, which read as "the game just ate it"). The timer takes
      // the hit and so does a heart, same as before.
      state.carrying = null
      state.artifactStates[carried.id] = 'hidden'
      state.timeLeftMs = Math.max(0, state.timeLeftMs - WRONG_PLACEMENT_PENALTY_MS)
      state.lastWrongPlacement = Date.now()
      return { kind: 'placed-wrong', id: carried.id }
    }
    return { kind: 'none' }
  }

  for (const artifact of ARTIFACTS) {
    if (state.artifactStates[artifact.id] !== 'hidden') continue
    if (Math.abs(playerX - artifact.hideX) > FIND_RADIUS) continue
    state.artifactStates[artifact.id] = 'found'
    state.carrying = artifact.id
    return { kind: 'found', id: artifact.id }
  }

  return { kind: 'none' }
}

/** A fluted marble column with a gold capital and base. */
function drawMarbleColumn(ctx: CanvasRenderingContext2D, x: number, width: number, height: number) {
  ctx.fillStyle = '#e8e4dc'
  ctx.fillRect(x, ATLANTIS_GROUND_Y - height, width, height)
  ctx.strokeStyle = 'rgba(160, 150, 130, 0.4)'
  ctx.lineWidth = 1
  for (let i = 1; i < 4; i++) {
    ctx.beginPath()
    ctx.moveTo(x + (width / 4) * i, ATLANTIS_GROUND_Y - height + 8)
    ctx.lineTo(x + (width / 4) * i, ATLANTIS_GROUND_Y - 8)
    ctx.stroke()
  }
  ctx.fillStyle = '#d4af37'
  ctx.fillRect(x - 4, ATLANTIS_GROUND_Y - height, width + 8, 7)
  ctx.fillRect(x - 4, ATLANTIS_GROUND_Y - 7, width + 8, 7)
}

/** A weathered marble statue silhouette — a robed, headless-classical figure on a plinth. */
function drawStatue(ctx: CanvasRenderingContext2D, x: number) {
  ctx.fillStyle = '#d4af37'
  ctx.fillRect(x - 16, ATLANTIS_GROUND_Y - 10, 32, 10)
  ctx.fillStyle = '#dcd6c8'
  ctx.beginPath()
  ctx.moveTo(x - 10, ATLANTIS_GROUND_Y - 10)
  ctx.quadraticCurveTo(x - 12, ATLANTIS_GROUND_Y - 70, x - 5, ATLANTIS_GROUND_Y - 95)
  ctx.lineTo(x + 5, ATLANTIS_GROUND_Y - 95)
  ctx.quadraticCurveTo(x + 12, ATLANTIS_GROUND_Y - 70, x + 10, ATLANTIS_GROUND_Y - 10)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = '#ece7da'
  ctx.beginPath()
  ctx.arc(x, ATLANTIS_GROUND_Y - 102, 8, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = 'rgba(150, 140, 120, 0.3)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(x - 2, ATLANTIS_GROUND_Y - 90)
  ctx.lineTo(x - 4, ATLANTIS_GROUND_Y - 20)
  ctx.moveTo(x + 3, ATLANTIS_GROUND_Y - 85)
  ctx.lineTo(x + 5, ATLANTIS_GROUND_Y - 20)
  ctx.stroke()
}

/** A single fish, a simple silhouette drifting across a window. */
function drawFish(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, color: string) {
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.ellipse(x, y, size, size * 0.45, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.beginPath()
  ctx.moveTo(x - size, y)
  ctx.lineTo(x - size * 1.6, y - size * 0.4)
  ctx.lineTo(x - size * 1.6, y + size * 0.4)
  ctx.closePath()
  ctx.fill()
}

/** A shark silhouette, larger and further back, drifting slowly past. */
function drawShark(ctx: CanvasRenderingContext2D, x: number, y: number, time: number) {
  const drift = Math.sin(time / 3000 + x) * 6
  ctx.fillStyle = 'rgba(90, 100, 110, 0.75)'
  ctx.beginPath()
  ctx.ellipse(x, y + drift, 32, 10, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.beginPath()
  ctx.moveTo(x - 32, y + drift)
  ctx.lineTo(x - 46, y + drift - 8)
  ctx.lineTo(x - 46, y + drift + 8)
  ctx.closePath()
  ctx.fill()
  ctx.beginPath()
  ctx.moveTo(x, y + drift - 9)
  ctx.lineTo(x + 6, y + drift - 20)
  ctx.lineTo(x + 12, y + drift - 9)
  ctx.closePath()
  ctx.fill()
}

/** A big arched window looking out into the sea, with light caustics and passing sea life. */
function drawSeaWindow(ctx: CanvasRenderingContext2D, x: number, width: number, time: number) {
  const height = 220
  const top = ATLANTIS_GROUND_Y - height - 20

  // Gold frame.
  ctx.fillStyle = '#c9a227'
  ctx.beginPath()
  ctx.moveTo(x - 8, ATLANTIS_GROUND_Y - 20)
  ctx.lineTo(x - 8, top + width / 2)
  ctx.quadraticCurveTo(x - 8, top - 8, x + width / 2, top - 8)
  ctx.quadraticCurveTo(x + width + 8, top - 8, x + width + 8, top + width / 2)
  ctx.lineTo(x + width + 8, ATLANTIS_GROUND_Y - 20)
  ctx.closePath()
  ctx.fill()

  // The sea itself — deep blue gradient with light shafts.
  ctx.save()
  ctx.beginPath()
  ctx.moveTo(x, ATLANTIS_GROUND_Y - 20)
  ctx.lineTo(x, top + width / 2)
  ctx.quadraticCurveTo(x, top, x + width / 2, top)
  ctx.quadraticCurveTo(x + width, top, x + width, top + width / 2)
  ctx.lineTo(x + width, ATLANTIS_GROUND_Y - 20)
  ctx.closePath()
  ctx.clip()

  const sea = ctx.createLinearGradient(0, top, 0, ATLANTIS_GROUND_Y)
  sea.addColorStop(0, '#1f6f8f')
  sea.addColorStop(1, '#0a2f47')
  ctx.fillStyle = sea
  ctx.fillRect(x, top, width, height + 20)

  // Caustic light shafts, drifting slowly.
  ctx.fillStyle = 'rgba(180, 230, 255, 0.08)'
  for (let i = 0; i < 3; i++) {
    const sway = Math.sin(time / 2500 + i * 2) * 14
    ctx.beginPath()
    ctx.moveTo(x + 20 + i * 40 + sway, top)
    ctx.lineTo(x + 45 + i * 40 + sway, top)
    ctx.lineTo(x + 30 + i * 40, ATLANTIS_GROUND_Y - 20)
    ctx.lineTo(x + 5 + i * 40, ATLANTIS_GROUND_Y - 20)
    ctx.closePath()
    ctx.fill()
  }

  // Fish drifting past, looping around based on time and window position.
  const fishColors = ['#ff9d4d', '#ffd24d', '#7de0ff']
  for (let i = 0; i < 4; i++) {
    const t = (time / 1800 + i * 0.9 + x * 0.01) % 4
    const fx = x + ((t / 4) * (width + 40)) - 20
    const fy = top + 40 + ((i * 37) % (height - 60))
    drawFish(ctx, fx, fy, 6, fishColors[i % fishColors.length] ?? '#ffd24d')
  }

  drawShark(ctx, x + width * 0.55, top + height * 0.5, time)

  ctx.restore()

  // Frame highlight.
  ctx.strokeStyle = 'rgba(255, 236, 180, 0.6)'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(x, ATLANTIS_GROUND_Y - 20)
  ctx.lineTo(x, top + width / 2)
  ctx.quadraticCurveTo(x, top, x + width / 2, top)
  ctx.quadraticCurveTo(x + width, top, x + width, top + width / 2)
  ctx.lineTo(x + width, ATLANTIS_GROUND_Y - 20)
  ctx.stroke()
}

/** A gold-and-marble pedestal, lit when it holds its artifact. */
function drawPedestal(ctx: CanvasRenderingContext2D, x: number, filled: boolean) {
  ctx.fillStyle = '#e8e4dc'
  ctx.beginPath()
  ctx.moveTo(x - 16, ATLANTIS_GROUND_Y)
  ctx.lineTo(x - 12, ATLANTIS_GROUND_Y - 34)
  ctx.lineTo(x + 12, ATLANTIS_GROUND_Y - 34)
  ctx.lineTo(x + 16, ATLANTIS_GROUND_Y)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = '#d4af37'
  ctx.fillRect(x - 16, ATLANTIS_GROUND_Y - 6, 32, 6)
  ctx.fillRect(x - 13, ATLANTIS_GROUND_Y - 40, 26, 6)

  if (filled) {
    const glow = ctx.createRadialGradient(x, ATLANTIS_GROUND_Y - 44, 2, x, ATLANTIS_GROUND_Y - 44, 26)
    glow.addColorStop(0, 'rgba(255, 230, 150, 0.6)')
    glow.addColorStop(1, 'rgba(255, 230, 150, 0)')
    ctx.fillStyle = glow
    ctx.beginPath()
    ctx.arc(x, ATLANTIS_GROUND_Y - 44, 26, 0, Math.PI * 2)
    ctx.fill()
  }
}

function drawTrident(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.strokeStyle = '#c9a227'
  ctx.lineWidth = 2.5
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(x, y + 10)
  ctx.lineTo(x, y - 14)
  ctx.moveTo(x - 6, y - 4)
  ctx.lineTo(x - 6, y - 16)
  ctx.moveTo(x + 6, y - 4)
  ctx.lineTo(x + 6, y - 16)
  ctx.moveTo(x - 8, y - 8)
  ctx.lineTo(x + 8, y - 8)
  ctx.stroke()
  ctx.fillStyle = '#e8c964'
  for (const dx of [-6, 0, 6]) {
    ctx.beginPath()
    ctx.arc(x + dx, y - 16, 2, 0, Math.PI * 2)
    ctx.fill()
  }
}

function drawShell(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.fillStyle = '#e8c964'
  ctx.beginPath()
  ctx.arc(x, y, 8, Math.PI, 0)
  ctx.closePath()
  ctx.fill()
  ctx.strokeStyle = '#c9a227'
  ctx.lineWidth = 1
  for (const dx of [-5, -2, 1, 4]) {
    ctx.beginPath()
    ctx.moveTo(x + dx, y)
    ctx.lineTo(x + dx * 1.3, y - 7)
    ctx.stroke()
  }
}

function drawCrown(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.fillStyle = '#e8c964'
  ctx.beginPath()
  ctx.moveTo(x - 8, y + 6)
  ctx.lineTo(x - 8, y - 2)
  ctx.lineTo(x - 4, y - 8)
  ctx.lineTo(x, y - 2)
  ctx.lineTo(x + 4, y - 8)
  ctx.lineTo(x + 8, y - 2)
  ctx.lineTo(x + 8, y + 6)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = '#f2f2f2'
  ctx.beginPath()
  ctx.arc(x, y - 2, 2, 0, Math.PI * 2)
  ctx.fill()
}

function drawArtifactGlyph(ctx: CanvasRenderingContext2D, id: ArtifactId, x: number, y: number) {
  if (id === 'trident') drawTrident(ctx, x, y)
  else if (id === 'shell') drawShell(ctx, x, y)
  else drawCrown(ctx, x, y)
}

export interface AtlantisRenderState {
  quest: AtlantisQuestState
  playerX: number
  cameraX: number
  /** 0-1, fades the palace in on arrival — mirrors the ending chamber's own settle beat. */
  appear: number
}

/**
 * The palace of Atlantis — Poseidon's throne room, seen after the golden
 * light: soaring marble columns, gold trim, statues, and huge arched
 * windows onto the open sea, fish and a shark drifting past. Elegant and
 * majestic rather than the enclosed torch-lit spaces before it. Three
 * hidden artifacts and their pedestals sit along the walkable path.
 */
export function renderAtlantisScene(ctx: CanvasRenderingContext2D, state: AtlantisRenderState, time: number): void {
  const cam = state.cameraX
  ctx.clearRect(0, 0, ATLANTIS_CANVAS_WIDTH, ATLANTIS_CANVAS_HEIGHT)

  const sky = ctx.createLinearGradient(0, 0, 0, ATLANTIS_GROUND_Y)
  sky.addColorStop(0, '#0d3550')
  sky.addColorStop(1, '#123a52')
  ctx.fillStyle = sky
  ctx.fillRect(0, 0, ATLANTIS_CANVAS_WIDTH, ATLANTIS_CANVAS_HEIGHT)

  // Marble path floor with a central gold inlay strip.
  ctx.fillStyle = '#e0dccf'
  ctx.fillRect(0, ATLANTIS_GROUND_Y, ATLANTIS_CANVAS_WIDTH, ATLANTIS_CANVAS_HEIGHT - ATLANTIS_GROUND_Y)
  ctx.fillStyle = 'rgba(201, 162, 39, 0.5)'
  ctx.fillRect(0, ATLANTIS_GROUND_Y + 26, ATLANTIS_CANVAS_WIDTH, 6)

  // Columns lining the hall.
  const columnSpacing = 220
  for (let wx = 60; wx < ATLANTIS_WORLD_WIDTH; wx += columnSpacing) {
    const screenX = wx - cam
    if (screenX < -50 || screenX > ATLANTIS_CANVAS_WIDTH + 50) continue
    drawMarbleColumn(ctx, screenX, 26, 390)
  }

  // Big sea windows between alternating columns.
  for (let wx = 160; wx < ATLANTIS_WORLD_WIDTH; wx += columnSpacing) {
    const screenX = wx - cam
    if (screenX < -140 || screenX > ATLANTIS_CANVAS_WIDTH + 140) continue
    drawSeaWindow(ctx, screenX, 120, time)
  }

  // Statues at intervals along the path — positions shared with ARTIFACTS
  // above (each artifact hides directly behind its own statue), and chosen
  // to fall in a column gap so nothing overlaps a column.
  for (const wx of STATUE_POSITIONS) {
    const screenX = wx - cam
    if (screenX < -30 || screenX > ATLANTIS_CANVAS_WIDTH + 30) continue
    drawStatue(ctx, screenX)
  }

  // Pedestals and their artifacts.
  for (const artifact of ARTIFACTS) {
    const screenX = artifact.pedestalX - cam
    if (screenX < -40 || screenX > ATLANTIS_CANVAS_WIDTH + 40) continue
    const placed = state.quest.artifactStates[artifact.id] === 'placed'
    drawPedestal(ctx, screenX, placed)
    if (placed) drawArtifactGlyph(ctx, artifact.id, screenX, ATLANTIS_GROUND_Y - 46)
  }

  // Hidden artifacts, tucked at the base of their statue rather than
  // sitting exposed in the open — offset behind and to the side, small and
  // dim with only a faint, slow glimmer, so actually finding one takes
  // walking close rather than spotting it from across the hall.
  for (const artifact of ARTIFACTS) {
    const status = state.quest.artifactStates[artifact.id]
    if (status !== 'hidden') continue
    const screenX = artifact.hideX - cam + 10
    if (screenX < -20 || screenX > ATLANTIS_CANVAS_WIDTH + 20) continue
    const glimmer = 0.28 + Math.sin(time / 900 + artifact.hideX) * 0.14
    ctx.save()
    ctx.globalAlpha = glimmer
    ctx.translate(screenX, ATLANTIS_GROUND_Y - 6)
    ctx.scale(0.7, 0.7)
    drawArtifactGlyph(ctx, artifact.id, 0, 0)
    ctx.restore()
  }

  // The carried artifact, floating just above the player's head — without
  // this there is no visible sign an item was ever picked up, which reads
  // as the game being stuck rather than "go place it now."
  if (state.quest.carrying) {
    const screenX = state.playerX - cam
    const bob = Math.sin(time / 300) * 4
    ctx.save()
    ctx.translate(0, bob)
    const haloGlow = ctx.createRadialGradient(screenX, ATLANTIS_GROUND_Y - 118, 2, screenX, ATLANTIS_GROUND_Y - 118, 22)
    haloGlow.addColorStop(0, 'rgba(255, 230, 150, 0.5)')
    haloGlow.addColorStop(1, 'rgba(255, 230, 150, 0)')
    ctx.fillStyle = haloGlow
    ctx.beginPath()
    ctx.arc(screenX, ATLANTIS_GROUND_Y - 118, 22, 0, Math.PI * 2)
    ctx.fill()
    drawArtifactGlyph(ctx, state.quest.carrying, screenX, ATLANTIS_GROUND_Y - 118)
    ctx.restore()
  }

  // Palace glow — a warm gold vignette instead of the corridor's darkening
  // one, so the room reads as majestic rather than threatening.
  const glowVignette = ctx.createRadialGradient(
    ATLANTIS_CANVAS_WIDTH / 2,
    ATLANTIS_CANVAS_HEIGHT / 2,
    ATLANTIS_CANVAS_HEIGHT * 0.2,
    ATLANTIS_CANVAS_WIDTH / 2,
    ATLANTIS_CANVAS_HEIGHT / 2,
    ATLANTIS_CANVAS_HEIGHT * 0.85,
  )
  glowVignette.addColorStop(0, 'rgba(0,0,0,0)')
  glowVignette.addColorStop(1, 'rgba(5, 20, 35, 0.35)')
  ctx.fillStyle = glowVignette
  ctx.fillRect(0, 0, ATLANTIS_CANVAS_WIDTH, ATLANTIS_CANVAS_HEIGHT)

  if (state.appear < 1) {
    ctx.fillStyle = `rgba(255, 250, 230, ${1 - state.appear})`
    ctx.fillRect(0, 0, ATLANTIS_CANVAS_WIDTH, ATLANTIS_CANVAS_HEIGHT)
  }
}

export { ATLANTIS_GROUND_Y, ATLANTIS_WORLD_WIDTH }

// ============================================================================
// Poseidon's throne room. Reached once the Atlantis quest is complete — a
// single static beat (a seated greeting, then a walk into the light),
// mirroring the ending chamber's own shape.
// ============================================================================

export const POSEIDON_CANVAS_WIDTH = 1280
export const POSEIDON_CANVAS_HEIGHT = 720
const POSEIDON_GROUND_Y = 570

export interface PoseidonSceneState {
  /** 0-1, fades the throne room in on arrival. */
  appear: number
  /** 0-1, the whiteout that carries the player into the light once they walk forward. */
  exitFlash: number
}

export function createPoseidonSceneState(): PoseidonSceneState {
  return { appear: 0, exitFlash: 0 }
}

/** A trident-bearing guard, standing at rigid attention beside the throne. */
function drawGuard(ctx: CanvasRenderingContext2D, x: number, facing: 1 | -1) {
  ctx.save()
  ctx.translate(x, POSEIDON_GROUND_Y)
  ctx.scale(facing, 1)

  // Legs.
  ctx.fillStyle = '#2f5f78'
  ctx.fillRect(-7, -46, 6, 46)
  ctx.fillRect(1, -46, 6, 46)

  // Torso — a scaled cuirass, sea-green rather than plain armor.
  ctx.fillStyle = '#3f7a92'
  ctx.fillRect(-10, -92, 20, 48)
  ctx.strokeStyle = 'rgba(200, 230, 240, 0.4)'
  ctx.lineWidth = 1
  for (let i = 0; i < 3; i++) {
    ctx.beginPath()
    ctx.moveTo(-10, -84 + i * 12)
    ctx.lineTo(10, -84 + i * 12)
    ctx.stroke()
  }

  // Head.
  ctx.fillStyle = '#e2c9a8'
  ctx.beginPath()
  ctx.arc(0, -100, 8, 0, Math.PI * 2)
  ctx.fill()

  // A helmet crest.
  ctx.fillStyle = '#c9a227'
  ctx.beginPath()
  ctx.ellipse(0, -108, 9, 4, 0, 0, Math.PI * 2)
  ctx.fill()

  // A short trident, held upright.
  ctx.strokeStyle = '#e8c964'
  ctx.lineWidth = 2.5
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(16, -20)
  ctx.lineTo(16, -130)
  ctx.moveTo(11, -118)
  ctx.lineTo(11, -134)
  ctx.moveTo(21, -118)
  ctx.lineTo(21, -134)
  ctx.moveTo(9, -122)
  ctx.lineTo(23, -122)
  ctx.stroke()

  ctx.restore()
}

/** Poseidon himself, seated — a broad, bearded, sea-crowned figure on his throne. */
function drawPoseidon(ctx: CanvasRenderingContext2D, x: number, appear: number) {
  ctx.save()
  ctx.globalAlpha = Math.min(1, appear * 1.4)
  ctx.translate(x, POSEIDON_GROUND_Y - (1 - appear) * 30)

  // The throne — tall, coral-and-gold, far grander than the guards' plain armor.
  ctx.fillStyle = '#1f6f8f'
  ctx.beginPath()
  ctx.moveTo(-70, 6)
  ctx.lineTo(-60, -180)
  ctx.lineTo(60, -180)
  ctx.lineTo(70, 6)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = '#c9a227'
  ctx.fillRect(-72, -184, 144, 8)
  ctx.fillRect(-72, 0, 144, 8)

  // Coral-shaped finials along the backrest's top edge.
  ctx.fillStyle = '#e07856'
  for (const dx of [-45, -15, 15, 45]) {
    ctx.beginPath()
    ctx.arc(dx, -184, 10, Math.PI, 0)
    ctx.fill()
  }

  // Poseidon's seated body.
  ctx.fillStyle = '#1a5a78'
  ctx.beginPath()
  ctx.moveTo(-38, 0)
  ctx.quadraticCurveTo(-42, -80, -30, -120)
  ctx.lineTo(30, -120)
  ctx.quadraticCurveTo(42, -80, 38, 0)
  ctx.closePath()
  ctx.fill()

  // Beard and head.
  ctx.fillStyle = '#e2c9a8'
  ctx.beginPath()
  ctx.arc(0, -140, 20, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#dbe4e6'
  ctx.beginPath()
  ctx.moveTo(-18, -136)
  ctx.quadraticCurveTo(-16, -105, 0, -98)
  ctx.quadraticCurveTo(16, -105, 18, -136)
  ctx.closePath()
  ctx.fill()

  // A coral-and-pearl crown.
  ctx.fillStyle = '#c9a227'
  ctx.beginPath()
  ctx.moveTo(-18, -156)
  ctx.lineTo(-18, -164)
  ctx.lineTo(-9, -150)
  ctx.lineTo(0, -168)
  ctx.lineTo(9, -150)
  ctx.lineTo(18, -164)
  ctx.lineTo(18, -156)
  ctx.closePath()
  ctx.fill()

  // The trident, held upright and much larger than the guards'.
  ctx.strokeStyle = '#e8c964'
  ctx.lineWidth = 4
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(52, 4)
  ctx.lineTo(52, -190)
  ctx.moveTo(40, -170)
  ctx.lineTo(40, -204)
  ctx.moveTo(64, -170)
  ctx.lineTo(64, -204)
  ctx.moveTo(34, -178)
  ctx.lineTo(70, -178)
  ctx.stroke()

  ctx.restore()
}

/**
 * Poseidon's own throne room, reached once the Atlantis quest is complete —
 * a distinct beat from the palace floor the player was just exploring,
 * mirroring the Sphinx's own ending chamber (a golden door, a seated
 * greeting, a walk into the light). Two trident-guards flank the throne;
 * static, since this is a single dialogue beat, not something to explore.
 */
export function renderPoseidonThroneScene(
  ctx: CanvasRenderingContext2D,
  state: PoseidonSceneState,
  time: number,
): void {
  ctx.clearRect(0, 0, POSEIDON_CANVAS_WIDTH, POSEIDON_CANVAS_HEIGHT)

  const sky = ctx.createLinearGradient(0, 0, 0, POSEIDON_GROUND_Y)
  sky.addColorStop(0, '#083048')
  sky.addColorStop(1, '#0f4a68')
  ctx.fillStyle = sky
  ctx.fillRect(0, 0, POSEIDON_CANVAS_WIDTH, POSEIDON_CANVAS_HEIGHT)

  // Marble floor, matching the palace outside.
  ctx.fillStyle = '#dcd8cc'
  ctx.fillRect(0, POSEIDON_GROUND_Y, POSEIDON_CANVAS_WIDTH, POSEIDON_CANVAS_HEIGHT - POSEIDON_GROUND_Y)
  ctx.fillStyle = 'rgba(201, 162, 39, 0.5)'
  ctx.fillRect(0, POSEIDON_GROUND_Y + 26, POSEIDON_CANVAS_WIDTH, 6)

  const centerX = POSEIDON_CANVAS_WIDTH / 2

  // Ambient caustic shimmer behind the throne, echoing the sea windows.
  const glow = ctx.createRadialGradient(centerX, POSEIDON_GROUND_Y - 150, 10, centerX, POSEIDON_GROUND_Y - 150, 260)
  const shimmer = 0.14 + Math.sin(time / 1400) * 0.03
  glow.addColorStop(0, `rgba(90, 200, 230, ${shimmer})`)
  glow.addColorStop(1, 'rgba(90, 200, 230, 0)')
  ctx.fillStyle = glow
  ctx.fillRect(centerX - 260, POSEIDON_GROUND_Y - 410, 520, 410)

  drawGuard(ctx, centerX - 150, 1)
  drawGuard(ctx, centerX + 150, -1)
  drawPoseidon(ctx, centerX, state.appear)

  if (state.exitFlash > 0) {
    ctx.fillStyle = `rgba(255, 250, 230, ${state.exitFlash})`
    ctx.fillRect(0, 0, POSEIDON_CANVAS_WIDTH, POSEIDON_CANVAS_HEIGHT)
  }

  if (state.appear < 1) {
    ctx.fillStyle = `rgba(5, 20, 30, ${1 - state.appear})`
    ctx.fillRect(0, 0, POSEIDON_CANVAS_WIDTH, POSEIDON_CANVAS_HEIGHT)
  }
}

export { POSEIDON_GROUND_Y }

// ============================================================================
// Olympus — a top-down carpet race. Reached through Poseidon's own door:
// fly freely in every direction, collect ten coins, reach the finish gate,
// against a countdown clock. Entirely client-side, same as Atlantis
// (ADR-0070) — there is no server-checked answer here at all.
// ============================================================================

export const OLYMPUS_CANVAS_WIDTH = 1280
export const OLYMPUS_CANVAS_HEIGHT = 720

/** The hall as a top-down map — much bigger than one screen, so the camera follows the carpet. */
export const OLYMPUS_WORLD_WIDTH = 2600
export const OLYMPUS_WORLD_HEIGHT = 1600

export const OLYMPUS_RACE_TIME_MS = 30000
export const OLYMPUS_COIN_COUNT = 10

const CARPET_SPEED = 320 // px/sec
const COIN_RADIUS = 26
const FINISH_WIDTH = 90

export interface Coin {
  id: number
  x: number
  y: number
  collected: boolean
}

/** Deterministic layout — spread across the hall so no two coins cluster, with the finish gate at the far end. */
export const OLYMPUS_COINS: readonly { x: number; y: number }[] = [
  { x: 320, y: 260 },
  { x: 680, y: 480 },
  { x: 420, y: 820 },
  { x: 900, y: 220 },
  { x: 1180, y: 700 },
  { x: 1500, y: 380 },
  { x: 1350, y: 1080 },
  { x: 1850, y: 560 },
  { x: 2050, y: 950 },
  { x: 2280, y: 300 },
]

export const OLYMPUS_FINISH_X = OLYMPUS_WORLD_WIDTH - 120
export const OLYMPUS_START_X = 140
export const OLYMPUS_START_Y = OLYMPUS_WORLD_HEIGHT / 2

export interface CarpetPlayer {
  x: number
  y: number
  /** Radians — the carpet's current facing/heading, purely visual (tilts the sprite into turns). */
  heading: number
}

export interface OlympusRaceState {
  coins: Coin[]
  timeLeftMs: number
  /** 0-1, fades the hall in on arrival. */
  appear: number
  finished: boolean
}

export function createOlympusRaceState(): OlympusRaceState {
  return {
    coins: OLYMPUS_COINS.map((pos, id) => ({ id, x: pos.x, y: pos.y, collected: false })),
    timeLeftMs: OLYMPUS_RACE_TIME_MS,
    appear: 0,
    finished: false,
  }
}

export function createCarpetPlayer(): CarpetPlayer {
  return { x: OLYMPUS_START_X, y: OLYMPUS_START_Y, heading: 0 }
}

export interface CarpetKeysDown {
  up: boolean
  down: boolean
  left: boolean
  right: boolean
}

/** Free 2D movement (top-down), clamped to the hall's bounds. */
export function advanceCarpet(player: CarpetPlayer, keys: CarpetKeysDown, dtMs: number): void {
  const dt = dtMs / 1000
  const dx = (keys.right ? 1 : 0) - (keys.left ? 1 : 0)
  const dy = (keys.down ? 1 : 0) - (keys.up ? 1 : 0)

  if (dx !== 0 || dy !== 0) {
    const len = Math.hypot(dx, dy)
    player.x = Math.max(30, Math.min(OLYMPUS_WORLD_WIDTH - 30, player.x + (dx / len) * CARPET_SPEED * dt))
    player.y = Math.max(30, Math.min(OLYMPUS_WORLD_HEIGHT - 30, player.y + (dy / len) * CARPET_SPEED * dt))
    player.heading = Math.atan2(dy, dx)
  }
}

/** Collects any coin within pickup range — called every frame, not on a discrete interact key, since driving over one is the whole point. */
export function collectNearbyCoins(state: OlympusRaceState, player: CarpetPlayer): number {
  let collectedThisFrame = 0
  for (const coin of state.coins) {
    if (coin.collected) continue
    if (Math.hypot(coin.x - player.x, coin.y - player.y) < COIN_RADIUS + 16) {
      coin.collected = true
      collectedThisFrame += 1
    }
  }
  return collectedThisFrame
}

export function allCoinsCollected(state: OlympusRaceState): boolean {
  return state.coins.every((coin) => coin.collected)
}

export function reachedFinish(player: CarpetPlayer): boolean {
  return player.x >= OLYMPUS_FINISH_X - FINISH_WIDTH / 2
}

/** A gold coin, spinning slowly (drawn as a squash on the horizontal axis to fake rotation from a top-down view). */
function drawCoin(ctx: CanvasRenderingContext2D, x: number, y: number, time: number) {
  const spin = Math.abs(Math.sin(time / 500 + x * 0.01))
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(0.35 + spin * 0.65, 1)
  ctx.fillStyle = '#f0cf5a'
  ctx.beginPath()
  ctx.arc(0, 0, COIN_RADIUS, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = '#c9a227'
  ctx.lineWidth = 3
  ctx.stroke()
  ctx.fillStyle = '#fff3c9'
  ctx.beginPath()
  ctx.arc(-6, -6, COIN_RADIUS * 0.4, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()

  const glow = ctx.createRadialGradient(x, y, 4, x, y, 40)
  glow.addColorStop(0, 'rgba(255, 230, 150, 0.35)')
  glow.addColorStop(1, 'rgba(255, 230, 150, 0)')
  ctx.fillStyle = glow
  ctx.beginPath()
  ctx.arc(x, y, 40, 0, Math.PI * 2)
  ctx.fill()
}

/** The flying carpet, viewed from above — a rectangle with tassels and a gentle sine-wave ripple. */
function drawCarpetPlayer(ctx: CanvasRenderingContext2D, player: CarpetPlayer, time: number) {
  ctx.save()
  ctx.translate(player.x, player.y)
  ctx.rotate(player.heading)

  const ripple = Math.sin(time / 220) * 2

  // Shadow beneath, offset slightly to sell height above the floor.
  ctx.fillStyle = 'rgba(0,0,0,0.25)'
  ctx.beginPath()
  ctx.ellipse(4, 6, 34, 20, 0, 0, Math.PI * 2)
  ctx.fill()

  ctx.fillStyle = '#8a2f2f'
  ctx.beginPath()
  ctx.roundRect(-30, -18 + ripple * 0.3, 60, 36, 6)
  ctx.fill()
  ctx.strokeStyle = '#e8c964'
  ctx.lineWidth = 2
  ctx.strokeRect(-26, -14 + ripple * 0.3, 52, 28)

  // A diamond medallion pattern, purely decorative.
  ctx.fillStyle = '#e8c964'
  ctx.beginPath()
  ctx.moveTo(0, -8)
  ctx.lineTo(8, 0)
  ctx.lineTo(0, 8)
  ctx.lineTo(-8, 0)
  ctx.closePath()
  ctx.fill()

  // Tassels trailing behind.
  ctx.strokeStyle = '#c9a227'
  ctx.lineWidth = 2
  for (const dy of [-14, 0, 14]) {
    ctx.beginPath()
    ctx.moveTo(-30, dy)
    ctx.lineTo(-40 - Math.abs(ripple), dy + ripple)
    ctx.stroke()
  }

  ctx.restore()
}

/** The finish gate — a wide band of golden light with a dashed threshold line, glowing more the closer the player already is to done. */
function drawFinishGate(ctx: CanvasRenderingContext2D, x: number, time: number) {
  const pulse = 0.5 + Math.sin(time / 500) * 0.15
  const glow = ctx.createLinearGradient(x - 160, 0, x + 60, 0)
  glow.addColorStop(0, 'rgba(255, 225, 140, 0)')
  glow.addColorStop(1, `rgba(255, 225, 140, ${0.5 * pulse})`)
  ctx.fillStyle = glow
  ctx.fillRect(x - 160, 0, 220, OLYMPUS_WORLD_HEIGHT)

  ctx.fillStyle = `rgba(255, 236, 180, ${0.55 * pulse})`
  ctx.fillRect(x - 6, 0, 12, OLYMPUS_WORLD_HEIGHT)
  ctx.strokeStyle = '#f0d27a'
  ctx.lineWidth = 5
  ctx.setLineDash([24, 16])
  ctx.beginPath()
  ctx.moveTo(x, 0)
  ctx.lineTo(x, OLYMPUS_WORLD_HEIGHT)
  ctx.stroke()
  ctx.setLineDash([])

  // A pair of tall gold finials flanking the gate, top and bottom of the hall.
  for (const y of [70, OLYMPUS_WORLD_HEIGHT - 70]) {
    const finialGlow = ctx.createRadialGradient(x, y, 4, x, y, 46)
    finialGlow.addColorStop(0, 'rgba(255, 236, 180, 0.7)')
    finialGlow.addColorStop(1, 'rgba(255, 236, 180, 0)')
    ctx.fillStyle = finialGlow
    ctx.beginPath()
    ctx.arc(x, y, 46, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#f0d27a'
    ctx.beginPath()
    ctx.arc(x, y, 12, 0, Math.PI * 2)
    ctx.fill()
  }
}

/** A god's statue, seen from above as a robed silhouette with a base ring — one stands watch at each column. */
function drawStatueTop(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.fillStyle = 'rgba(0,0,0,0.1)'
  ctx.beginPath()
  ctx.ellipse(x + 3, y + 4, 26, 26, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#f2eee2'
  ctx.beginPath()
  ctx.arc(x, y, 22, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = 'rgba(180, 160, 120, 0.4)'
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.arc(x, y, 22, 0, Math.PI * 2)
  ctx.stroke()
  ctx.fillStyle = '#d4af37'
  ctx.beginPath()
  ctx.arc(x, y, 6, 0, Math.PI * 2)
  ctx.fill()
}

/** A drifting cloud, seen from above — the hall is open to the sky, so clouds pass slowly beneath the far windows. */
function drawSkyCloud(ctx: CanvasRenderingContext2D, x: number, y: number, scale: number, time: number, seed: number) {
  const drift = Math.sin(time / 8000 + seed) * 30
  ctx.save()
  ctx.globalAlpha = 0.5
  ctx.translate(x + drift, y)
  ctx.scale(scale, scale * 0.6)
  ctx.fillStyle = '#ffffff'
  for (const [dx, dy, r] of [
    [-40, 0, 30],
    [0, -10, 38],
    [42, 0, 28],
    [80, 6, 20],
    [-70, 8, 18],
  ] as const) {
    ctx.beginPath()
    ctx.arc(dx, dy, r, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()
}

export interface OlympusRenderState {
  race: OlympusRaceState
  player: CarpetPlayer
  cameraX: number
  cameraY: number
}

// Fixed cloud positions, scattered under the open colonnade — deterministic
// so they don't pop or jump as the camera scrolls.
const SKY_CLOUDS: readonly { x: number; y: number; scale: number; seed: number }[] = [
  { x: 260, y: 380, scale: 1.4, seed: 0 },
  { x: 780, y: 900, scale: 1.1, seed: 1.4 },
  { x: 1120, y: 240, scale: 1.7, seed: 2.8 },
  { x: 1580, y: 1200, scale: 1.3, seed: 4.1 },
  { x: 1980, y: 640, scale: 1.5, seed: 5.5 },
  { x: 2320, y: 1000, scale: 1.2, seed: 6.9 },
  { x: 500, y: 1350, scale: 1.0, seed: 8.2 },
  { x: 2150, y: 200, scale: 1.1, seed: 9.6 },
]

const STATUE_ROW_Y = [140, OLYMPUS_WORLD_HEIGHT - 140]

/**
 * The hall of Olympus, seen from above — the carpet race's own perspective,
 * distinct from every other scene in this room (all side-on). Gold-veined
 * marble, a colonnade of statues, clouds drifting far below the open sky
 * above the hall, ten scattered coins, and a glowing finish gate. The
 * camera follows the carpet since the hall is much larger than one screen.
 */
export function renderOlympusRace(ctx: CanvasRenderingContext2D, state: OlympusRenderState, time: number): void {
  const { race, player, cameraX, cameraY } = state
  ctx.clearRect(0, 0, OLYMPUS_CANVAS_WIDTH, OLYMPUS_CANVAS_HEIGHT)

  // A pale sky-blue base beneath everything — Olympus's hall is open to the
  // heavens, so even the "floor" reads as looking down through open air
  // onto marble, not a sealed room.
  const base = ctx.createLinearGradient(0, 0, 0, OLYMPUS_WORLD_HEIGHT)
  base.addColorStop(0, '#bfe0f0')
  base.addColorStop(1, '#d8ecec')
  ctx.fillStyle = base
  ctx.fillRect(0, 0, OLYMPUS_WORLD_WIDTH, OLYMPUS_WORLD_HEIGHT)

  ctx.save()
  ctx.translate(-cameraX, -cameraY)

  for (const cloud of SKY_CLOUDS) {
    drawSkyCloud(ctx, cloud.x, cloud.y, cloud.scale, time, cloud.seed)
  }

  // The marble floor itself, warmer and richer than open sky, laid over it
  // with a soft edge so it reads as a floating palace floor.
  const floor = ctx.createLinearGradient(0, 0, 0, OLYMPUS_WORLD_HEIGHT)
  floor.addColorStop(0, '#f7f1e4')
  floor.addColorStop(1, '#ece3cf')
  ctx.fillStyle = floor
  ctx.fillRect(0, 0, OLYMPUS_WORLD_WIDTH, OLYMPUS_WORLD_HEIGHT)

  // Gold-veined tile grid — warmer and more visible than a flat gray line
  // grid, so the floor itself reads as a palace rather than a spreadsheet.
  ctx.strokeStyle = 'rgba(201, 162, 39, 0.28)'
  ctx.lineWidth = 1.5
  const tile = 130
  for (let x = 0; x < OLYMPUS_WORLD_WIDTH; x += tile) {
    ctx.beginPath()
    ctx.moveTo(x, 0)
    ctx.lineTo(x, OLYMPUS_WORLD_HEIGHT)
    ctx.stroke()
  }
  for (let y = 0; y < OLYMPUS_WORLD_HEIGHT; y += tile) {
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(OLYMPUS_WORLD_WIDTH, y)
    ctx.stroke()
  }

  // A wide gold inlay path down the center of the hall, the ceremonial lane
  // leading straight to the finish gate.
  ctx.fillStyle = 'rgba(212, 175, 55, 0.16)'
  ctx.fillRect(0, OLYMPUS_WORLD_HEIGHT / 2 - 90, OLYMPUS_WORLD_WIDTH, 180)

  // Columns (statues seen from above) in two rows flanking a wide central
  // lane so the carpet always has room to move.
  for (let x = 200; x < OLYMPUS_WORLD_WIDTH - 100; x += 260) {
    for (const y of STATUE_ROW_Y) {
      drawStatueTop(ctx, x, y)
    }
  }

  drawFinishGate(ctx, OLYMPUS_FINISH_X, time)

  for (const coin of race.coins) {
    if (!coin.collected) drawCoin(ctx, coin.x, coin.y, time)
  }

  drawCarpetPlayer(ctx, player, time)

  // A warm golden vignette — the same majestic, open feeling as the rest of
  // Olympus's other scenes, instead of a flat, evenly-lit floor.
  const vignette = ctx.createRadialGradient(
    player.x,
    player.y,
    OLYMPUS_CANVAS_HEIGHT * 0.25,
    player.x,
    player.y,
    OLYMPUS_CANVAS_HEIGHT * 0.9,
  )
  vignette.addColorStop(0, 'rgba(0,0,0,0)')
  vignette.addColorStop(1, 'rgba(90, 70, 30, 0.14)')
  ctx.fillStyle = vignette
  ctx.fillRect(cameraX, cameraY, OLYMPUS_CANVAS_WIDTH, OLYMPUS_CANVAS_HEIGHT)

  ctx.restore()

  if (race.appear < 1) {
    ctx.fillStyle = `rgba(255, 250, 230, ${1 - race.appear})`
    ctx.fillRect(0, 0, OLYMPUS_CANVAS_WIDTH, OLYMPUS_CANVAS_HEIGHT)
  }
}

// ============================================================================
// The waiting room — reached only after Olympus is won. A calm chamber with
// three arched windows onto memories of everywhere the player has been,
// under a night sky, where an angelic figure delivers the final word.
// ============================================================================

export const WAITING_ROOM_WIDTH = 1280
export const WAITING_ROOM_HEIGHT = 720
const WAITING_ROOM_GROUND_Y = 570

export interface WaitingRoomState {
  /** 0-1, fades the room in on arrival. */
  appear: number
}

export function createWaitingRoomState(): WaitingRoomState {
  return { appear: 0 }
}

/** A single star, gently twinkling. */
function drawStar(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, time: number, seed: number) {
  const twinkle = 0.5 + Math.sin(time / 900 + seed) * 0.4
  ctx.fillStyle = `rgba(230, 220, 255, ${twinkle})`
  ctx.beginPath()
  ctx.arc(x, y, size, 0, Math.PI * 2)
  ctx.fill()
}

/** One of the three memory-windows — a tall arched frame holding a miniature of a past world. */
function drawMemoryWindow(
  ctx: CanvasRenderingContext2D,
  x: number,
  width: number,
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number, time: number) => void,
  time: number,
) {
  const height = 260
  const top = WAITING_ROOM_GROUND_Y - height - 40

  ctx.save()
  ctx.translate(x, top)
  ctx.beginPath()
  ctx.moveTo(0, height)
  ctx.lineTo(0, width / 2)
  ctx.quadraticCurveTo(0, 0, width / 2, 0)
  ctx.quadraticCurveTo(width, 0, width, width / 2)
  ctx.lineTo(width, height)
  ctx.closePath()
  ctx.clip()
  draw(ctx, width, height, time)
  ctx.restore()

  // Gold frame, drawn after the clip is released.
  ctx.strokeStyle = 'rgba(255, 236, 190, 0.7)'
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(x, top + height)
  ctx.lineTo(x, top + width / 2)
  ctx.quadraticCurveTo(x, top, x + width / 2, top)
  ctx.quadraticCurveTo(x + width, top, x + width, top + width / 2)
  ctx.lineTo(x + width, top + height)
  ctx.stroke()
}

function drawPyramidMemory(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const sky = ctx.createLinearGradient(0, 0, 0, h)
  sky.addColorStop(0, '#3a2410')
  sky.addColorStop(1, '#8a5a28')
  ctx.fillStyle = sky
  ctx.fillRect(0, 0, w, h)
  ctx.fillStyle = '#c99a4e'
  ctx.beginPath()
  ctx.moveTo(w * 0.5, h * 0.35)
  ctx.lineTo(w * 0.85, h * 0.9)
  ctx.lineTo(w * 0.15, h * 0.9)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = 'rgba(0,0,0,0.15)'
  ctx.beginPath()
  ctx.moveTo(w * 0.5, h * 0.35)
  ctx.lineTo(w * 0.85, h * 0.9)
  ctx.lineTo(w * 0.6, h * 0.9)
  ctx.closePath()
  ctx.fill()
}

function drawAtlantisMemory(ctx: CanvasRenderingContext2D, w: number, h: number, time: number) {
  const sea = ctx.createLinearGradient(0, 0, 0, h)
  sea.addColorStop(0, '#1f6f8f')
  sea.addColorStop(1, '#062338')
  ctx.fillStyle = sea
  ctx.fillRect(0, 0, w, h)
  for (let i = 0; i < 3; i++) {
    const fy = h * 0.3 + i * h * 0.22 + Math.sin(time / 1000 + i) * 6
    ctx.fillStyle = 'rgba(120, 210, 255, 0.7)'
    ctx.beginPath()
    ctx.ellipse(w * (0.3 + i * 0.2), fy, 8, 4, 0, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.fillStyle = 'rgba(220, 190, 100, 0.4)'
  ctx.fillRect(0, h * 0.8, w, h * 0.2)
}

function drawOlympusMemory(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const sky = ctx.createLinearGradient(0, 0, 0, h)
  sky.addColorStop(0, '#6fa8dc')
  sky.addColorStop(1, '#dce8e0')
  ctx.fillStyle = sky
  ctx.fillRect(0, 0, w, h)
  ctx.fillStyle = 'rgba(255,255,255,0.6)'
  ctx.beginPath()
  ctx.ellipse(w * 0.3, h * 0.75, 24, 10, 0, 0, Math.PI * 2)
  ctx.ellipse(w * 0.65, h * 0.65, 30, 12, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#eee8da'
  ctx.fillRect(w * 0.15, h * 0.5, 8, h * 0.5)
  ctx.fillRect(w * 0.77, h * 0.5, 8, h * 0.5)
}

/** The angelic being — a tall, softly glowing, wing-shouldered figure of light. */
function drawAngel(ctx: CanvasRenderingContext2D, x: number, appear: number, time: number) {
  ctx.save()
  ctx.globalAlpha = Math.min(1, appear * 1.3)
  ctx.translate(x, WAITING_ROOM_GROUND_Y)

  const drift = Math.sin(time / 1200) * 4

  const halo = ctx.createRadialGradient(0, -190 + drift, 4, 0, -190 + drift, 60)
  halo.addColorStop(0, 'rgba(255, 250, 235, 0.9)')
  halo.addColorStop(1, 'rgba(255, 250, 235, 0)')
  ctx.fillStyle = halo
  ctx.beginPath()
  ctx.arc(0, -190 + drift, 60, 0, Math.PI * 2)
  ctx.fill()

  // Wings — soft, translucent, violet-tinted light rather than feathers.
  ctx.fillStyle = 'rgba(200, 180, 255, 0.35)'
  for (const dx of [-1, 1]) {
    ctx.beginPath()
    ctx.moveTo(dx * 8, -140 + drift)
    ctx.quadraticCurveTo(dx * 90, -150 + drift, dx * 110, -60 + drift)
    ctx.quadraticCurveTo(dx * 60, -70 + drift, dx * 8, -30 + drift)
    ctx.closePath()
    ctx.fill()
  }

  // Robed body, luminous white-gold.
  const bodyGlow = ctx.createLinearGradient(0, -170 + drift, 0, 0)
  bodyGlow.addColorStop(0, '#fffaf0')
  bodyGlow.addColorStop(1, 'rgba(255, 250, 235, 0.4)')
  ctx.fillStyle = bodyGlow
  ctx.beginPath()
  ctx.moveTo(-26, 0)
  ctx.quadraticCurveTo(-30, -100 + drift, -14, -150 + drift)
  ctx.lineTo(14, -150 + drift)
  ctx.quadraticCurveTo(30, -100 + drift, 26, 0)
  ctx.closePath()
  ctx.fill()

  // Head.
  ctx.fillStyle = '#fffdf5'
  ctx.beginPath()
  ctx.arc(0, -168 + drift, 16, 0, Math.PI * 2)
  ctx.fill()

  ctx.restore()
}

/**
 * The waiting room, reached only after Olympus is won — a calm chamber with
 * three arched windows onto memories of everywhere the player has been
 * (the pyramid corridor, Atlantis, Olympus), under a night sky, where an
 * angelic figure delivers the final word before the player finishes.
 */
export function renderWaitingRoom(ctx: CanvasRenderingContext2D, state: WaitingRoomState, time: number): void {
  ctx.clearRect(0, 0, WAITING_ROOM_WIDTH, WAITING_ROOM_HEIGHT)

  const sky = ctx.createLinearGradient(0, 0, 0, WAITING_ROOM_GROUND_Y)
  sky.addColorStop(0, '#0a0530')
  sky.addColorStop(0.6, '#241154')
  sky.addColorStop(1, '#3a1f66')
  ctx.fillStyle = sky
  ctx.fillRect(0, 0, WAITING_ROOM_WIDTH, WAITING_ROOM_HEIGHT)

  for (let i = 0; i < 60; i++) {
    const sx = (i * 137) % WAITING_ROOM_WIDTH
    const sy = (i * 83) % (WAITING_ROOM_GROUND_Y - 60)
    drawStar(ctx, sx, sy, 1 + (i % 3) * 0.5, time, i)
  }

  // A faint violet-blue aurora band across the sky.
  const aurora = ctx.createLinearGradient(0, WAITING_ROOM_GROUND_Y * 0.15, 0, WAITING_ROOM_GROUND_Y * 0.55)
  aurora.addColorStop(0, 'rgba(120, 90, 220, 0)')
  aurora.addColorStop(0.5, `rgba(140, 120, 255, ${0.12 + Math.sin(time / 1800) * 0.04})`)
  aurora.addColorStop(1, 'rgba(90, 160, 255, 0)')
  ctx.fillStyle = aurora
  ctx.fillRect(0, 0, WAITING_ROOM_WIDTH, WAITING_ROOM_GROUND_Y)

  // Floor, pale marble with a violet cast rather than the warm gold of the
  // palaces before it — this room is calm, not triumphant.
  ctx.fillStyle = '#d6d0e0'
  ctx.fillRect(0, WAITING_ROOM_GROUND_Y, WAITING_ROOM_WIDTH, WAITING_ROOM_HEIGHT - WAITING_ROOM_GROUND_Y)
  ctx.fillStyle = 'rgba(160, 140, 220, 0.4)'
  ctx.fillRect(0, WAITING_ROOM_GROUND_Y + 26, WAITING_ROOM_WIDTH, 5)

  drawMemoryWindow(ctx, 160, 220, drawPyramidMemory, time)
  drawMemoryWindow(ctx, 530, 220, (c, w, h, t) => drawAtlantisMemory(c, w, h, t), time)
  drawMemoryWindow(ctx, 900, 220, (c, w, h) => drawOlympusMemory(c, w, h), time)

  drawAngel(ctx, WAITING_ROOM_WIDTH / 2, state.appear, time)

  if (state.appear < 1) {
    ctx.fillStyle = `rgba(10, 5, 30, ${1 - state.appear})`
    ctx.fillRect(0, 0, WAITING_ROOM_WIDTH, WAITING_ROOM_HEIGHT)
  }
}

export { WAITING_ROOM_GROUND_Y }
