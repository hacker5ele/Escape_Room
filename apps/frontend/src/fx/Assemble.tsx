import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'

/**
 * Pages that unbuild themselves into dots, and rebuild out of them.
 *
 * Everything printed in this app is a halftone — the page ground, the
 * characters, the scenery, all of it dots on a 6px grid (ADR-0032). So the
 * transition is the print dissolving back into its own screen: each panel and
 * control loses its ink until only its dots are left, those dots fade into the
 * page's identical dots, and then the next screen's pieces fly in from their
 * own directions and land.
 *
 * That is the whole reason this replaces an iris wipe. An iris is correct for
 * the period and generic to every cartoon ever made; this one could not belong
 * to any design system that was not already built out of dots. See ADR-0044.
 *
 * **What moves.** Panels — the outermost `.pane` of any nest — plus the
 * controls somebody actually points at: room tiles, emote keys, PLAY. Not every
 * button and not list rows: thirty flying friend rows read as noise rather than
 * as motion. Anything else opts in with `data-piece`, and out with
 * `data-piece="no"`.
 *
 * A control inside a panel moves *as well as* its panel, not instead of it, so
 * the transforms compound and the tiles drift within the panel as it arrives.
 * That parallax is most of what sells it.
 *
 * **Different every time.** Direction, distance, spin and delay are redrawn per
 * navigation, so no two arrivals are alike.
 */

/** Ink gone, dots left, before the route is allowed to change. */
const LEAVE_MS = 340
const HOLD_MS = 120
export const LEAVE_TOTAL_MS = LEAVE_MS + HOLD_MS

const ARRIVE_MS = 560
/** The travel half of the arrival — the one whose end means a piece has landed. */
const LANDED = 'piece-land'

/**
 * The gap between one piece setting off and the next.
 *
 * A **fixed** gap per piece was fine while a screen held about twenty of them
 * and stopped being fine the moment the room's scenery joined in: at forty
 * pieces the last one would not set off for one and a half seconds, so the wave
 * outlasted the animation it was supposed to be part of.
 *
 * The gap is the thing that gives, not the wave. Below the crossover a screen
 * keeps the leisurely spacing it has now; above it the pieces simply tighten up,
 * which is what a crowd does anyway.
 */
const STAGGER_MS = 42
const WAVE_MS = 720

export function stagger(count: number, longest: number, cap: number): number {
  return Math.min(cap, longest / Math.max(1, count - 1))
}

/** Outermost only — a panel nested in a panel rides with its parent. */
const PANEL = '.pane'
/** The things a player aims at. Deliberately not every `.btn`. */
const CONTROL = '.room-tile, .emote-key, .play-button'

type Mode = 'fly' | 'gather'

function prefersReducedMotion(): boolean {
  // jsdom has no matchMedia, and neither do very old browsers.
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
}

function wanted(node: HTMLElement): boolean {
  return node.dataset.piece !== 'no' && !node.closest('[data-piece="no"]')
}

/**
 * The pieces of a screen, in document order.
 *
 * Order matters: it becomes the stagger, so a screen assembles roughly
 * top-to-bottom with a jitter over it rather than in whatever order the
 * selectors happened to match. One query rather than three, because
 * `querySelectorAll` returns document order and merging three lists loses it.
 */
export function pieces(root: HTMLElement): HTMLElement[] {
  const found = [
    ...root.querySelectorAll<HTMLElement>(`${PANEL}, ${CONTROL}, [data-piece]`),
  ].filter(wanted)

  // A panel inside a panel rides with its parent — animating both would move it
  // twice as far as everything else.
  const nested = (node: HTMLElement) =>
    node.matches(PANEL) &&
    found.some((other) => other !== node && other.matches(PANEL) && other.contains(node))

  const moving = found.filter((node) => !nested(node))

  // A screen with no panels and no controls — a full-bleed stage — would
  // otherwise animate nothing at all. Its direct children are the next guess.
  if (moving.length > 0) return moving
  return [...root.children].filter((child): child is HTMLElement => child instanceof HTMLElement)
}

/**
 * How far a piece travels.
 *
 * Scaled to the viewport: a fixed 400px throws a panel most of the way across a
 * phone and barely anywhere on a desktop, so the same number is two different
 * animations.
 */
function reach(mode: Mode): number {
  const span = Math.min(window.innerWidth || 1024, 1280)
  return mode === 'fly' ? span * 0.3 + Math.random() * span * 0.2 : span * 0.06 + Math.random() * 60
}

/**
 * Turns a piece around rather than letting it start off the right or the bottom
 * of the page.
 *
 * A transformed element still contributes to scrollable overflow, so a piece
 * waiting 400px to the right widens the document and flashes a scrollbar. The
 * obvious answer is to clip the container — and it is the wrong one: an
 * `overflow` other than `visible` anywhere above a `.pane` silently disables its
 * `backdrop-filter`, which is the first rule in this project's stylesheet. Doing
 * it "only during the animation" still means every panel on the page is flat for
 * the length of the animation, which is exactly what it looks like.
 *
 * Coming from the left or the top costs nothing — content outside those edges is
 * not scrollable to — so a piece with no room to its right simply arrives from
 * the other side. The distance is never shortened, only mirrored.
 */
function inward(node: HTMLElement, dx: number, dy: number): [number, number] {
  const box = node.getBoundingClientRect()
  // A rotated rectangle is wider than its box; leave room for the corner.
  const slack = box.width * 0.1 + 8
  const right = document.documentElement.clientWidth - box.right - slack
  const below = document.documentElement.clientHeight - box.bottom - slack

  return [dx > right ? -dx : dx, dy > below ? -dy : dy]
}

function place(node: HTMLElement, mode: Mode, index: number, delayStep: number): void {
  const angle = Math.random() * Math.PI * 2
  const distance = reach(mode)
  const [dx, dy] = inward(node, Math.cos(angle) * distance, Math.sin(angle) * distance)

  node.style.setProperty('--fly-x', `${Math.round(dx)}px`)
  node.style.setProperty('--fly-y', `${Math.round(dy)}px`)
  node.style.setProperty('--fly-spin', `${(Math.random() - 0.5) * (mode === 'fly' ? 26 : 8)}deg`)
  // Jittered, so the order is a drift down the page rather than a wave.
  node.style.setProperty('--fly-delay', `${Math.round(index * delayStep + Math.random() * 70)}ms`)
}

function clear(node: HTMLElement): void {
  node.classList.remove('piece-arriving', 'piece-leaving')
  for (const name of ['--fly-x', '--fly-y', '--fly-spin', '--fly-delay']) {
    node.style.removeProperty(name)
  }
}

/**
 * The one mounted container, so `unbuild()` needs no argument and no ref
 * threaded down from the route table. There is exactly one `<Assemble>` in the
 * app — it wraps the outlet inside `RequiresGame`, above every screen it
 * animates, which is what lets it survive the route change it is covering.
 */
let mounted: HTMLElement | null = null

/**
 * Takes the current screen apart.
 *
 * Called before navigating; `LEAVE_TOTAL_MS` later the screen is nothing but
 * the page's own halftone, which is the moment the route can change unseen.
 *
 * Nothing is cleaned up afterwards, on purpose — React unmounts this DOM the
 * instant the route changes, and touching it in between would only make the
 * pieces flash back into place first.
 */
export function unbuild(): void {
  if (!mounted || prefersReducedMotion()) return

  const moving = pieces(mounted)
  // Whatever is left after the dissolve itself is all the stagger can have —
  // past that, the route changes while the last pieces are still half there,
  // and the new screen appears on top of them.
  const step = stagger(moving.length, LEAVE_TOTAL_MS - LEAVE_MS, 16)

  moving.forEach((node, index) => {
    // A short throw on the way out. The dissolve is the exit; the travel only
    // gives it a direction, and is not there to carry the piece off screen.
    place(node, 'gather', index, step)
    node.classList.add('piece-leaving')
  })
}

export function Assemble({ children }: { children: React.ReactNode }) {
  const host = useRef<HTMLDivElement | null>(null)
  const { pathname } = useLocation()

  useEffect(() => {
    mounted = host.current
    return () => {
      mounted = null
    }
  }, [])

  useEffect(() => {
    const root = host.current
    if (!root || prefersReducedMotion()) return

    // Home is where everything comes back together; anywhere else is an
    // arrival, and arrivals are thrown from further away.
    const mode: Mode = pathname === '/' ? 'gather' : 'fly'
    const moving = pieces(root)

    const step = stagger(moving.length, WAVE_MS, STAGGER_MS)

    root.dataset.assembleMode = mode
    moving.forEach((node, index) => {
      place(node, mode, index, step)
      node.classList.add('piece-arriving')
    })

    /**
     * Each piece is cleaned up the moment *it* lands, not when the last one
     * does.
     *
     * A piece in flight carries a transform, which is a stacking context, which
     * is the one thing a `.pane` is not supposed to have. Nothing compensates
     * for that — every attempt to compensate is what made panels fly in pale —
     * so the answer is to hold it for as short a time as possible. On one shared
     * timer the first panel kept a transform for the entire stagger, most of a
     * second after it had visibly settled.
     *
     * Clearing also matters for what comes after: a leftover transform fights
     * whatever animates the element next, and the character rig is
     * transform-driven from end to end.
     */
    const onEnd = (event: AnimationEvent) => {
      if (event.animationName !== LANDED) return
      // Animations on descendants bubble to here too.
      if (event.target instanceof HTMLElement && moving.includes(event.target)) clear(event.target)
    }
    root.addEventListener('animationend', onEnd)

    // `animationend` does not fire for an element that never got to animate —
    // a display change, a piece removed mid-flight. This is the floor sweep.
    const settled = window.setTimeout(
      () => {
        delete root.dataset.assembleMode
        for (const node of moving) clear(node)
      },
      ARRIVE_MS + (moving.length - 1) * step + 140,
    )

    return () => {
      root.removeEventListener('animationend', onEnd)
      window.clearTimeout(settled)
      for (const node of moving) clear(node)
    }
  }, [pathname])

  return (
    <div ref={host} className="assemble">
      {children}
    </div>
  )
}
