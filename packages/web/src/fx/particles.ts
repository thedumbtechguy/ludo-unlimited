/** A tiny particle simulation: pure data and a step function, drawn elsewhere (FxLayer). */

export type Rgb = readonly [number, number, number]
export type Point = { x: number; y: number }
export type Blend = 'source-over' | 'lighter'
/**
 * A crisp dot, a soft glowing puff (flames, smoke), a flat spinning rectangle (confetti, shards) or a
 * streak: a short line drawn along the direction of travel (speed lines, rockets).
 */
export type Shape = 'dot' | 'soft' | 'rect' | 'streak'

export type ParticleInit = {
  x: number
  y: number
  /** px per second */
  vx: number
  vy: number
  /** seconds */
  life: number
  /** Radius in px at birth, and at death (defaults to the same). */
  size: number
  endSize?: number
  /** Colour stops across the life, blended between. */
  colors: readonly Rgb[]
  /** Opacity at birth; it fades to 0 by the end of the life. */
  alpha?: number
  /** How long the opacity holds before fading: 1 fades evenly, 2 (the default) holds then drops. */
  hold?: number
  /** px per second², positive falls, negative rises. */
  gravity?: number
  /** Fraction of the velocity lost per second. */
  drag?: number
  blend?: Blend
  shape?: Shape
  /** Rects: the starting angle (radians), spin (radians per second) and height as a fraction of the width. */
  angle?: number
  spin?: number
  aspect?: number
  /** Streaks: the line's length, as seconds of travel at the current speed. */
  stretch?: number
  /** Burst into these when the life runs out (a firework rocket). */
  pop?: { count: number; make: Make }
}

export type Particle = Required<Omit<ParticleInit, 'pop'>> & Pick<ParticleInit, 'pop'> & { age: number }

/** Makes one particle; x and y are offsets from wherever it is spawned. */
export type Make = (rand: () => number) => ParticleInit

export type Emitter = {
  /** Particles per second. */
  rate: number
  /** Where to spawn right now (screen px), or undefined to pause spawning. */
  at: () => Point | undefined
  make: Make
  /** Fractional particles owed from earlier steps. */
  owed: number
  /** While dying down: seconds left and the total, scaling the rate to 0. */
  fading?: { left: number; total: number }
  done: boolean
}

/**
 * A drawn shape with a fixed timeline, rather than a moving particle: an expanding ring, or a
 * lightning bolt that flickers. Times are seconds; it waits `delay`, then plays over `duration`.
 */
export type Mark =
  | { kind: 'ring'; x: number; y: number; from: number; to: number; width: number; rgb: Rgb; edge?: Rgb; delay: number; duration: number }
  | {
      kind: 'bolt'
      /** One jagged line per flicker, so each flash is a fresh crack. */
      paths: Point[][]
      width: number
      rgb: Rgb
      edge: Rgb
      delay: number
      duration: number
    }
export type LiveMark = Mark & { age: number }

export type World = { particles: Particle[]; emitters: Emitter[]; marks: LiveMark[]; cap: number }

export const FULL_CAP = 400
export const REDUCED_CAP = 40

export const createWorld = (cap = FULL_CAP): World => ({ particles: [], emitters: [], marks: [], cap })

/** How many of `count` particles to make at an effects level: all of them, or a tenth (at least one). */
export const scaledCount = (count: number, reduced: boolean): number => (reduced ? Math.ceil(count * 0.1) : count)

/** Adds a particle unless the world is at its cap. */
export function spawn(world: World, init: ParticleInit): boolean {
  if (world.particles.length >= world.cap) return false
  world.particles.push({
    endSize: init.size,
    alpha: 1,
    hold: 2,
    gravity: 0,
    drag: 0,
    blend: 'source-over',
    shape: 'dot',
    angle: 0,
    spin: 0,
    aspect: 0.5,
    stretch: 0.04,
    ...init,
    age: 0,
  })
  return true
}

/** `count` particles made by `make` around (x, y). Returns how many fit under the cap. */
export function burst(world: World, x: number, y: number, count: number, make: Make, rand: () => number): number {
  let spawned = 0
  for (let i = 0; i < count; i++) {
    const p = make(rand)
    if (!spawn(world, { ...p, x: x + p.x, y: y + p.y })) break
    spawned++
  }
  return spawned
}

export const isIdle = (world: World): boolean => world.particles.length === 0 && world.emitters.length === 0 && world.marks.length === 0

/** Advance by `dt` seconds: emitters spawn, particles move and age, the dead and finished go. */
export function step(world: World, dt: number, rand: () => number): void {
  for (const emitter of world.emitters) {
    let rate = emitter.rate
    if (emitter.fading) {
      emitter.fading.left -= dt
      if (emitter.fading.left <= 0) emitter.done = true
      rate *= Math.max(0, emitter.fading.left / emitter.fading.total)
    }
    if (emitter.done) continue
    emitter.owed += rate * dt
    const at = emitter.at()
    while (emitter.owed >= 1) {
      emitter.owed -= 1
      if (at) {
        const p = emitter.make(rand)
        spawn(world, { ...p, x: at.x + p.x, y: at.y + p.y })
      }
    }
  }
  world.emitters = world.emitters.filter((e) => !e.done)

  for (const p of world.particles) {
    p.age += dt
    const keep = Math.max(0, 1 - p.drag * dt)
    p.vx *= keep
    p.vy = p.vy * keep + p.gravity * dt
    p.x += p.vx * dt
    p.y += p.vy * dt
    p.angle += p.spin * dt
  }
  const dead = world.particles.filter((p) => p.age >= p.life)
  world.particles = world.particles.filter((p) => p.age < p.life)
  for (const p of dead) if (p.pop) burst(world, p.x, p.y, p.pop.count, p.pop.make, rand)

  for (const mark of world.marks) mark.age += dt
  world.marks = world.marks.filter((m) => m.age < m.delay + m.duration)
}

/** How far through its timeline a mark is: below 0 while it waits, 1 at the end. */
export const markProgress = (mark: LiveMark): number => (mark.age - mark.delay) / mark.duration

/**
 * Which of a bolt's `flashes` is lit at progress `t` (0–1), or -1 between flashes. Each flash is on
 * for the first 60% of its slot and dark for the rest, so it reads as a flicker, not a fade.
 */
export function boltFlash(t: number, flashes: number): number {
  if (t < 0 || t >= 1) return -1
  const slot = t * flashes
  const i = Math.floor(slot)
  return slot - i < 0.6 ? i : -1
}

/** How far through its life a particle is, 0 to 1. */
export const progress = (p: Particle): number => Math.min(1, p.age / p.life)

export function colorAt(colors: readonly Rgb[], t: number): Rgb {
  if (t >= 1 || colors.length === 1) return colors[colors.length - 1]
  const scaled = Math.max(0, t) * (colors.length - 1)
  const i = Math.floor(scaled)
  const f = scaled - i
  const [a, b] = [colors[i], colors[i + 1]]
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f]
}

/** What to paint for a particle right now. */
export function look(p: Particle): { radius: number; rgb: Rgb; alpha: number } {
  const t = progress(p)
  return { radius: p.size + (p.endSize - p.size) * t, rgb: colorAt(p.colors, t), alpha: p.alpha * (1 - t ** p.hold) }
}

export const hex = (value: string): Rgb => {
  const n = parseInt(value.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
