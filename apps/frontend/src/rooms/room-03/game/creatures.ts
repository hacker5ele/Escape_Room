import type { AtmosphereStage } from './corridor'

export interface SphinxPalette {
  /** Top-lit gradient stops, light to dark — weathered stone, not flat cartoon color. */
  bodyLight: string
  bodyMid: string
  bodyDark: string
  stoneDark: string
  stoneLight: string
}

export const CORRIDOR_SPHINX_PALETTE: SphinxPalette = {
  bodyLight: '#6e5c3e',
  bodyMid: '#584a30',
  bodyDark: '#372c1c',
  stoneDark: '#241c12',
  stoneLight: '#877050',
}

export const GOLD_SPHINX_PALETTE: SphinxPalette = {
  bodyLight: '#f6d888',
  bodyMid: '#d9ab4a',
  bodyDark: '#a97e2c',
  stoneDark: '#8a6522',
  stoneLight: '#ffe9ae',
}

/**
 * The one Sphinx in the game, modeled after the real monument: a long, low,
 * reclined lion body carries the mass, with a head that is deliberately
 * small relative to the body — the opposite of a cartoon/chibi
 * proportion — weathered sandstone shading, and a pharaoh's nemes
 * headdress. The back, neck and head crown are traced as one continuous
 * outline all the way from the ground, so the head sits ON the body rather
 * than being a separate shape placed near it (a separate neck piece is
 * what made an earlier version read as floating).
 */
export function drawSphinx(
  ctx: CanvasRenderingContext2D,
  x: number,
  groundY: number,
  posture: AtmosphereStage['sphinxPosture'],
  eyeGlow: string,
  awake: boolean,
  time: number,
  palette: SphinxPalette = CORRIDOR_SPHINX_PALETTE,
) {
  const scale = { reclined: 1, leaning: 1.04, upright: 1.08, looming: 1.16 }[posture]
  const leanForward = posture === 'leaning' || posture === 'upright' || posture === 'looming' ? 8 : 0

  // The body is long relative to the head, per the real proportions — but
  // the extra length lives in the haunches/rear, stretching the animal out
  // behind the head rather than pushing the head forward away from the
  // shoulders (which is what made an earlier version look detached).
  const bodyW = 236 * scale
  const bodyH = 54 * scale
  const headSize = 34 * scale

  const bodyGradient = ctx.createLinearGradient(0, -bodyH * 1.5, 0, 0)
  bodyGradient.addColorStop(0, palette.bodyLight)
  bodyGradient.addColorStop(0.55, palette.bodyMid)
  bodyGradient.addColorStop(1, palette.bodyDark)
  const stoneDark = palette.stoneDark
  const stoneLight = palette.stoneLight

  // The body's own footprint (rear haunch to front paw) is not centered on
  // local x=0 — the front end sits well left of center once the head was
  // pulled back over the haunches. `x` is meant to be where the caller
  // wants the whole statue visually centered, so translate by the
  // footprint's actual center rather than by x directly — otherwise "put
  // it at x" really put its rear half at x and its front half further
  // right, reading as off-center.
  const rearX = -bodyW * 0.52
  const frontX = bodyW * 0.18 + 12 // matches pawFrontX below
  const footprintCenter = (rearX + frontX) / 2
  const plinthW = frontX - rearX + 24

  ctx.save()
  ctx.translate(x - footprintCenter, groundY)

  // Ground-contact shadow.
  const groundShadow = ctx.createRadialGradient(footprintCenter, 4, 4, footprintCenter, 4, plinthW * 0.55)
  groundShadow.addColorStop(0, 'rgba(0,0,0,0.4)')
  groundShadow.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = groundShadow
  ctx.beginPath()
  ctx.ellipse(footprintCenter, 4, plinthW * 0.55, 14, 0, 0, Math.PI * 2)
  ctx.fill()

  // Plinth — a stone base matching the body's own length.
  const plinthX = rearX - 12
  ctx.fillStyle = stoneDark
  ctx.fillRect(plinthX, -14, plinthW, 14)
  ctx.strokeStyle = 'rgba(232, 176, 75, 0.15)'
  ctx.lineWidth = 1
  for (let i = 0; i < 14; i++) {
    const gx = plinthX + 10 + (i * (plinthW - 20)) / 13
    ctx.strokeRect(gx, -11, 5, 7)
  }

  // Rear haunches, drawn low and set well back — the bulk of a reclined
  // lion body sitting on the ground, not standing.
  ctx.fillStyle = bodyGradient
  ctx.beginPath()
  ctx.ellipse(-bodyW * 0.34, -bodyH * 0.5 - 14, bodyW * 0.2, bodyH * 0.55, 0, 0, Math.PI * 2)
  ctx.fill()

  // Tail, curled along the ground behind the haunches.
  ctx.strokeStyle = stoneDark
  ctx.lineWidth = 8
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(-bodyW * 0.52, -18)
  ctx.quadraticCurveTo(-bodyW * 0.64, -44, -bodyW * 0.5, -62)
  ctx.stroke()

  // The back and chest — one continuous silhouette from the rear haunch to
  // the front of the chest. The back stays low and mostly flat (a reclined
  // lion's spine is nearly horizontal), per the real Sphinx's proportions.
  const chestTopY = -bodyH * (1.0 + leanForward / 250) - 14
  const headX = bodyW * 0.06
  // Kept low, close over the back line — a reclined Sphinx's head sits
  // just above its shoulders, not raised high above the body, which is
  // what read as "flying."
  const headY = chestTopY - bodyH * 0.35 - headSize * 0.55
  const chestFrontX = bodyW * 0.1

  ctx.fillStyle = bodyGradient
  ctx.beginPath()
  ctx.moveTo(-bodyW * 0.52, -14) // rear, ground level
  ctx.quadraticCurveTo(-bodyW * 0.56, -bodyH * 0.95 - 14, -bodyW * 0.3, -bodyH * 1.05 - 14) // haunch rise
  ctx.quadraticCurveTo(-bodyW * 0.15, -bodyH * 1.02 - 14, chestFrontX, chestTopY) // back, shifted left toward the haunches
  ctx.lineTo(chestFrontX, chestTopY + bodyH * 0.35) // chest front
  ctx.lineTo(chestFrontX, -14) // down the chest front to the ground
  ctx.closePath()
  ctx.fill()

  // Neck — a separate solid column bridging the chest top directly to the
  // head, drawn wide and with generous vertical overlap at both ends (well
  // into the chest below, well into the headdress above) so there is no
  // seam or gap for the eye to find between "where the body's fill stops"
  // and "where the headdress/face begin." This is the deliberate fix for
  // the head reading as detached: the neck is not a thin bezier hoping to
  // line up with the head circle, it is a solid shape that physically
  // spans the whole gap and is then covered by the headdress on top.
  const neckWidth = headSize * 1.5
  ctx.fillStyle = bodyGradient
  ctx.beginPath()
  ctx.moveTo(headX - neckWidth * 0.5, chestTopY + bodyH * 0.3)
  ctx.quadraticCurveTo(headX - neckWidth * 0.56, headY + headSize * 0.6, headX - neckWidth * 0.4, headY - headSize * 0.2)
  ctx.lineTo(headX + neckWidth * 0.4, headY - headSize * 0.2)
  ctx.quadraticCurveTo(headX + neckWidth * 0.56, headY + headSize * 0.6, headX + neckWidth * 0.5, chestTopY + bodyH * 0.3)
  ctx.closePath()
  ctx.fill()

  // Rear haunch highlight bulge, layered on top so the hip reads as
  // rounded muscle rather than a flat line.
  ctx.fillStyle = bodyGradient
  ctx.beginPath()
  ctx.ellipse(-bodyW * 0.34, -bodyH * 0.5 - 14, bodyW * 0.18, bodyH * 0.5, 0, 0, Math.PI * 2)
  ctx.fill()

  // Forelegs — stretched forward along the ground from the chest base.
  // This is one of the Great Sphinx's most recognizable features: the paws
  // reach out in front of the body, side by side.
  const legTopY = chestTopY + bodyH * 0.25
  const pawFrontX = chestFrontX + bodyW * 0.08
  ctx.fillStyle = stoneDark
  for (const offset of [-19, 19]) {
    const legX = chestFrontX - bodyW * 0.1 + offset
    ctx.beginPath()
    // A slimmer shaft from the shoulder down to the wrist...
    ctx.moveTo(legX - 8, legTopY)
    ctx.lineTo(legX - 8, -24)
    // ...flaring out into a thicker paw at the toe end.
    ctx.quadraticCurveTo(legX - 8, -14, legX - 3, -14)
    ctx.lineTo(pawFrontX, -14)
    ctx.quadraticCurveTo(pawFrontX + 7, -14, pawFrontX + 5, -22)
    ctx.lineTo(legX + 8, -24)
    ctx.lineTo(legX + 8, legTopY)
    ctx.closePath()
    ctx.fill()
  }

  // Toe separations at the paws.
  ctx.strokeStyle = 'rgba(0,0,0,0.4)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(pawFrontX - 7, -21)
  ctx.lineTo(pawFrontX - 7, -14)
  ctx.moveTo(pawFrontX - 1, -21)
  ctx.lineTo(pawFrontX - 1, -14)
  ctx.stroke()

  // Nemes headdress side-lappets — the two flaps draping past the
  // shoulders, hanging lower than the crown. The single strongest
  // "pharaoh" silhouette cue.
  ctx.fillStyle = stoneDark
  for (const dx of [-1, 1]) {
    ctx.beginPath()
    ctx.moveTo(headX + dx * headSize * 0.8, headY + headSize * 0.5)
    ctx.quadraticCurveTo(
      headX + dx * headSize * 1.0,
      headY + headSize * 1.4,
      headX + dx * headSize * 0.6,
      headY + headSize * 1.9,
    )
    ctx.lineTo(headX + dx * headSize * 0.28, headY + headSize * 1.8)
    ctx.quadraticCurveTo(headX + dx * headSize * 0.5, headY + headSize * 1.2, headX + dx * headSize * 0.42, headY + headSize * 0.55)
    ctx.closePath()
    ctx.fill()
  }

  // Nemes headdress crown, flared wider than the face, rounded at the top
  // rather than flat — a softer, more graceful silhouette.
  ctx.fillStyle = stoneLight
  ctx.beginPath()
  ctx.moveTo(headX - headSize * 1.05, headY + headSize * 0.8)
  ctx.quadraticCurveTo(headX - headSize * 1.22, headY - headSize * 0.5, headX - headSize * 0.55, headY - headSize * 1.02)
  ctx.quadraticCurveTo(headX, headY - headSize * 1.22, headX + headSize * 0.55, headY - headSize * 1.02)
  ctx.quadraticCurveTo(headX + headSize * 1.22, headY - headSize * 0.5, headX + headSize * 1.05, headY + headSize * 0.8)
  ctx.quadraticCurveTo(headX, headY + headSize * 0.5, headX - headSize * 1.05, headY + headSize * 0.8)
  ctx.closePath()
  ctx.fill()

  // A thin golden edge along the crown's silhouette — the one flourish
  // that lifts it from "flat carved stone" toward "catches the light."
  ctx.strokeStyle = 'rgba(255, 224, 150, 0.4)'
  ctx.lineWidth = 1.2
  ctx.beginPath()
  ctx.moveTo(headX - headSize * 1.05, headY + headSize * 0.5)
  ctx.quadraticCurveTo(headX - headSize * 1.22, headY - headSize * 0.5, headX - headSize * 0.55, headY - headSize * 1.02)
  ctx.quadraticCurveTo(headX, headY - headSize * 1.22, headX + headSize * 0.55, headY - headSize * 1.02)
  ctx.quadraticCurveTo(headX + headSize * 1.22, headY - headSize * 0.5, headX + headSize * 1.05, headY + headSize * 0.5)
  ctx.stroke()

  // Headdress stripes.
  ctx.strokeStyle = stoneDark
  ctx.lineWidth = 1.8
  for (const dx of [-0.7, -0.32, 0.32, 0.7]) {
    ctx.beginPath()
    ctx.moveTo(headX + dx * headSize, headY - headSize * 0.9)
    ctx.lineTo(headX + dx * headSize * 0.9, headY + headSize * 0.68)
    ctx.stroke()
  }

  // Uraeus — the small coiled cobra on the brow, a distinctive pharaoh
  // detail that reads clearly even at a small scale.
  ctx.fillStyle = stoneDark
  ctx.beginPath()
  ctx.ellipse(headX, headY - headSize * 0.98, headSize * 0.1, headSize * 0.16, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = stoneDark
  ctx.lineWidth = 2.2
  ctx.beginPath()
  ctx.moveTo(headX, headY - headSize * 0.82)
  ctx.quadraticCurveTo(headX + headSize * 0.08, headY - headSize * 0.62, headX, headY - headSize * 0.5)
  ctx.stroke()

  // Frontal band where headdress meets the face.
  ctx.strokeStyle = 'rgba(0,0,0,0.3)'
  ctx.lineWidth = 1.3
  ctx.beginPath()
  ctx.moveTo(headX - headSize * 0.45, headY - headSize * 0.5)
  ctx.quadraticCurveTo(headX, headY - headSize * 0.64, headX + headSize * 0.45, headY - headSize * 0.5)
  ctx.stroke()

  // Face — small relative to the body, per the real proportions.
  ctx.fillStyle = bodyGradient
  ctx.beginPath()
  ctx.ellipse(headX, headY, headSize * 0.46, headSize * 0.56, 0, 0, Math.PI * 2)
  ctx.fill()

  // Brow shadow.
  ctx.fillStyle = 'rgba(0,0,0,0.35)'
  ctx.beginPath()
  ctx.ellipse(headX, headY - headSize * 0.1, headSize * 0.38, headSize * 0.14, 0, 0, Math.PI * 2)
  ctx.fill()

  // Eyes — weathered stone, not cartoon: narrow and carved, with only a
  // faint colored glow when awake rather than bright cartoon pupils.
  const eyeY = headY - headSize * 0.03
  if (awake) {
    const pulse = posture === 'looming' ? 1 + Math.sin(time / 220) * 0.12 : 1
    ctx.fillStyle = eyeGlow
    ctx.shadowColor = eyeGlow
    ctx.shadowBlur = 14 * pulse
    ctx.beginPath()
    ctx.ellipse(headX - headSize * 0.18, eyeY, 4 * scale * pulse, 2.6 * scale * pulse, 0, 0, Math.PI * 2)
    ctx.ellipse(headX + headSize * 0.18, eyeY, 4 * scale * pulse, 2.6 * scale * pulse, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.shadowBlur = 0
  } else {
    ctx.strokeStyle = 'rgba(0,0,0,0.5)'
    ctx.lineWidth = 1.3
    ctx.beginPath()
    ctx.moveTo(headX - headSize * 0.3, eyeY)
    ctx.lineTo(headX - headSize * 0.08, eyeY)
    ctx.moveTo(headX + headSize * 0.08, eyeY)
    ctx.lineTo(headX + headSize * 0.3, eyeY)
    ctx.stroke()
  }

  // Nose and a carved, closed mouth — enough for the face to read without
  // an expressive/cartoon shape.
  ctx.strokeStyle = 'rgba(0,0,0,0.3)'
  ctx.lineWidth = 0.9
  ctx.beginPath()
  ctx.moveTo(headX, eyeY + headSize * 0.06)
  ctx.lineTo(headX - headSize * 0.05, eyeY + headSize * 0.24)
  ctx.stroke()

  ctx.strokeStyle = 'rgba(0,0,0,0.32)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(headX - headSize * 0.13, eyeY + headSize * 0.38)
  ctx.quadraticCurveTo(headX, eyeY + headSize * 0.43, headX + headSize * 0.13, eyeY + headSize * 0.38)
  ctx.stroke()

  // Rim light tracing the actual back-curve silhouette, brightening when
  // awake — follows the same edge the body fill uses.
  if (awake) {
    ctx.strokeStyle = `${eyeGlow}55`
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(headX - headSize * 0.75, chestTopY - bodyH * 0.05)
    ctx.quadraticCurveTo(bodyW * 0.1, -bodyH * 1.02 - 14, -bodyW * 0.3, -bodyH * 1.05 - 14)
    ctx.stroke()
  }

  ctx.restore()
}

/**
 * A generic explorer/adventurer archetype — tank top, cargo pants, boots, a
 * ponytail, and a small utility belt — not any specific licensed character.
 * Leaner and more upright than a cute chibi build: the head stays roughly
 * head-sized rather than dominating, and the stance reads as purposeful
 * rather than shuffling.
 */
export function drawPlayer(
  ctx: CanvasRenderingContext2D,
  x: number,
  groundY: number,
  facing: 1 | -1,
  walking: boolean,
  time: number,
) {
  // One phase drives the whole gait. `front` > 0 means "the +x-side limbs
  // (leg AND arm) are in their forward part of the cycle." Real gait is
  // contralateral — the arm opposite a forward leg swings forward too — so
  // the +x arm is driven by the SAME sign as the -x leg, not its own leg.
  const phase = walking ? (time / 220) % (Math.PI * 2) : 0
  const front = Math.sin(phase) // +x leg/hip drive
  const bob = walking ? Math.abs(Math.sin(phase)) * 1.8 : 0

  // Position and mirroring happen first, in world space; every animated
  // offset below (legs, arms, ponytail, head bob) is drawn entirely inside
  // that already-mirrored local space, so nothing can push the character
  // against its own direction of travel.
  ctx.save()
  ctx.translate(x, groundY - bob)
  ctx.scale(facing, 1)

  // Contact shadow, so the figure is anchored to the floor.
  ctx.fillStyle = 'rgba(0,0,0,0.3)'
  ctx.beginPath()
  ctx.ellipse(0, 1, 9, 3, 0, 0, Math.PI * 2)
  ctx.fill()

  // Legs — cargo pants, drawn hip-to-knee-to-boot so a mid-stride bend
  // reads as a confident stride. The +x leg leads on `front > 0`.
  ctx.strokeStyle = '#4a5540'
  ctx.lineWidth = 5
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  const legTops: { x: number; kneeX: number; kneeY: number; footX: number }[] = []
  for (const side of [-1, 1] as const) {
    const legPhase = side > 0 ? front : -front
    const footX = side * 3 + legPhase * 8
    const kneeBend = Math.max(0, -legPhase) * 3
    const kneeX = side * 3 + legPhase * 3
    legTops.push({ x: side * 3, kneeX, kneeY: -11 - kneeBend, footX })
  }
  for (const leg of legTops) {
    ctx.beginPath()
    ctx.moveTo(leg.x, -22)
    ctx.lineTo(leg.kneeX, leg.kneeY)
    ctx.lineTo(leg.footX, -2)
    ctx.stroke()
  }
  // Boots — a short thick cap at each foot.
  ctx.strokeStyle = '#332a1c'
  ctx.lineWidth = 5.5
  for (const leg of legTops) {
    ctx.beginPath()
    ctx.moveTo(leg.footX, -3.5)
    ctx.lineTo(leg.footX, -1)
    ctx.stroke()
  }

  // Torso — a black tank top over a defined athletic frame: broader at the
  // shoulders, tapering in at the waist, instead of a straight-sided block.
  const torsoGradient = ctx.createLinearGradient(-7, -22, 7, -22)
  torsoGradient.addColorStop(0, '#0c0c0e')
  torsoGradient.addColorStop(0.5, '#232326')
  torsoGradient.addColorStop(1, '#0c0c0e')
  ctx.fillStyle = torsoGradient
  ctx.beginPath()
  ctx.moveTo(-5, -22) // waist, nipped in
  ctx.quadraticCurveTo(-8, -27, -7.5, -33) // out to the shoulder
  ctx.quadraticCurveTo(-6, -37, -3.5, -37.5)
  ctx.lineTo(3.5, -37.5)
  ctx.quadraticCurveTo(6, -37, 7.5, -33)
  ctx.quadraticCurveTo(8, -27, 5, -22) // back in to the waist
  ctx.closePath()
  ctx.fill()

  // A thin highlight down the centerline, just enough to suggest the top
  // isn't perfectly flat.
  ctx.strokeStyle = 'rgba(255,255,255,0.06)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(0, -36)
  ctx.lineTo(0, -23)
  ctx.stroke()

  // Utility belt.
  ctx.strokeStyle = '#3a2c1a'
  ctx.lineWidth = 2.5
  ctx.beginPath()
  ctx.moveTo(-6, -22)
  ctx.lineTo(6, -22)
  ctx.stroke()
  ctx.fillStyle = '#8a6f3a'
  ctx.fillRect(-1.5, -23.2, 3, 2.4) // belt buckle

  // Arms — bare (tank top), contralateral with the opposite leg.
  ctx.strokeStyle = '#e0b48a'
  ctx.lineWidth = 3.4
  ctx.lineCap = 'round'
  for (const side of [-1, 1] as const) {
    const armPhase = side > 0 ? -front : front
    ctx.beginPath()
    ctx.moveTo(side * 6, -34)
    ctx.quadraticCurveTo(side * 9 + armPhase * 2, -28, side * 6 + armPhase * 4, -21)
    ctx.stroke()
  }

  // Head — upright, forward-facing, roughly head-sized rather than
  // oversized. A faint counter-bob keeps it from moving in exact lockstep
  // with the torso.
  const headBob = walking ? Math.sin(phase) * 0.5 : 0
  const headX = 1
  const headY = -41 + headBob
  const headR = 6.4

  ctx.fillStyle = '#e0b48a'
  ctx.beginPath()
  ctx.arc(headX, headY, headR, 0, Math.PI * 2)
  ctx.fill()

  // Hair — curly: a base cap over the crown/back for solid coverage, then a
  // ring of small overlapping circles traced around its edge so the
  // silhouette reads as a mass of curls instead of a smooth cap. The base
  // ellipse stays behind and above eye level (eyes sit at roughly
  // headX+2.2..+5.2, headY-0.5) — it was previously wide and centered
  // close enough to the face that it covered both eyes outright.
  ctx.fillStyle = '#4a2f1a'
  ctx.beginPath()
  ctx.ellipse(headX - headR * 0.55, headY - headR * 0.5, headR * 0.62, headR * 0.75, 0, 0, Math.PI * 2)
  ctx.fill()

  // Curl bumps ringing the base cap — denser at the crown and back, thinning
  // out near the face so the hairline still frames the eyes clearly. None
  // of these reach past dx=0.15 on the front side, keeping clear of the
  // eyes at dx≈0.34..0.81 (headX+2.2..+5.2 relative to headR=6.4).
  const curlSpots: [number, number, number][] = [
    [-0.35, -1.05, 2.0], // crown, back
    [0.15, -0.95, 1.7], // crown, front
    [-0.85, -0.75, 1.9], // upper back
    [-1.15, -0.3, 2.0], // back
    [-1.2, 0.2, 1.8], // back, lower
    [-0.95, 0.55, 1.6], // nape
    [-0.5, 0.65, 1.4], // nape, front
    [-0.1, -0.55, 1.3], // fringe, above the brow, stops short of the eyes
  ]
  for (const [dx, dy, r] of curlSpots) {
    ctx.beginPath()
    ctx.arc(headX + dx * headR, headY + dy * headR, r, 0, Math.PI * 2)
    ctx.fill()
  }
  // A few darker shadow-curls layered on top for depth, so it doesn't read
  // as a flat cluster of same-tone circles.
  ctx.fillStyle = '#3a2414'
  for (const i of [1, 4, 6]) {
    const spot = curlSpots[i]
    if (!spot) continue
    const [dx, dy, r] = spot
    ctx.beginPath()
    ctx.arc(headX + dx * headR, headY + dy * headR, r * 0.55, 0, Math.PI * 2)
    ctx.fill()
  }

  // A couple of loose curls at the nape swing slightly with the walk, the
  // one remaining "which way are we going" cue now that there's no bun/
  // wisp to trail behind.
  const napeSwing = walking ? -front * 1.2 : 0
  ctx.fillStyle = '#4a2f1a'
  ctx.beginPath()
  ctx.arc(headX - headR * 0.85 + napeSwing, headY + headR * 0.75, 1.6, 0, Math.PI * 2)
  ctx.arc(headX - headR * 0.5 + napeSwing * 0.7, headY + headR * 0.95, 1.3, 0, Math.PI * 2)
  ctx.fill()

  // Simple confident eyes, on the leading (+x) side of the face.
  ctx.fillStyle = '#2a2016'
  ctx.beginPath()
  ctx.arc(headX + 2.2, headY - 0.5, 1, 0, Math.PI * 2)
  ctx.arc(headX + 5.2, headY - 0.5, 1, 0, Math.PI * 2)
  ctx.fill()

  ctx.restore()
}
