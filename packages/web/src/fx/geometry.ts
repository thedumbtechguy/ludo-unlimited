import type { Point } from './particles'

const lerp = (a: number, b: number, t: number) => a + (b - a) * t

/**
 * The control point of a kicked piece's flight from `from` to `to`: off the middle of the straight
 * line by a third of its length (plus a little), on the side towards the top of the screen, so the
 * piece is thrown up and over rather than slid along the board.
 */
export function arcControl(from: Point, to: Point): Point {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const length = Math.hypot(dx, dy)
  if (length === 0) return { ...from }
  let nx = -dy / length
  let ny = dx / length
  // Upwards on screen; a level flight bends up, a vertical one bends to the left.
  if (ny > 0 || (ny === 0 && nx > 0)) {
    nx = -nx
    ny = -ny
  }
  const lift = length / 3 + 20
  return { x: (from.x + to.x) / 2 + nx * lift, y: (from.y + to.y) / 2 + ny * lift }
}

/** Where the piece is at `t` (0–1) along its flight: a quadratic curve through the control point. */
export function arcAt(from: Point, to: Point, t: number): Point {
  const c = arcControl(from, to)
  const a = { x: lerp(from.x, c.x, t), y: lerp(from.y, c.y, t) }
  const b = { x: lerp(c.x, to.x, t), y: lerp(c.y, to.y, t) }
  return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) }
}

/** The flight starts fast and lands softly. */
export const arcEase = (t: number): number => 1 - (1 - t) ** 2

/** Grows as it rises towards the viewer and shrinks back as it lands, peaking at `peak`. */
export const arcScale = (t: number, peak = 1.3): number => 1 + (peak - 1) * 4 * t * (1 - t)

export type ArcFrame = Point & { scale: number }

/** `count` evenly timed frames of the flight (eased along the curve), first and last included. */
export function arcFrames(from: Point, to: Point, count: number): ArcFrame[] {
  return Array.from({ length: count }, (_, i) => {
    const t = arcEase(i / (count - 1))
    return { ...arcAt(from, to, t), scale: arcScale(t) }
  })
}

/**
 * A jagged lightning line from `from` to `to`: `segments` pieces, the inner points knocked sideways
 * by up to `jag` of the length, less near the ends so the bolt starts and lands on its squares.
 */
export function lightning(from: Point, to: Point, segments: number, jag: number, rand: () => number): Point[] {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const length = Math.hypot(dx, dy) || 1
  const nx = -dy / length
  const ny = dx / length
  return Array.from({ length: segments + 1 }, (_, i) => {
    const t = i / segments
    if (i === 0 || i === segments) return { x: lerp(from.x, to.x, t), y: lerp(from.y, to.y, t) }
    const taper = Math.sin(Math.PI * t)
    const off = (rand() * 2 - 1) * jag * length * taper
    return { x: lerp(from.x, to.x, t) + nx * off, y: lerp(from.y, to.y, t) + ny * off }
  })
}

/** Screen shake: `count` offsets of at most `px` that die away, back to rest at the end. */
export function shakeFrames(px: number, count: number, rand: () => number): Point[] {
  return Array.from({ length: count }, (_, i) => {
    if (i === count - 1) return { x: 0, y: 0 }
    const size = px * (1 - i / (count - 1))
    const angle = rand() * Math.PI * 2
    return { x: Math.cos(angle) * size, y: Math.sin(angle) * size }
  })
}
