/** A tiny particle simulation: pure data and a step function, drawn elsewhere (FxLayer). */

export type Rgb = readonly [number, number, number]
export type Point = { x: number; y: number }
export type Blend = 'source-over' | 'lighter'

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
  /** px per second², positive falls, negative rises. */
  gravity?: number
  /** Fraction of the velocity lost per second. */
  drag?: number
  blend?: Blend
}

export type Particle = Required<ParticleInit> & { age: number }

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

export type World = { particles: Particle[]; emitters: Emitter[]; cap: number }

export const FULL_CAP = 400
export const REDUCED_CAP = 40

export const createWorld = (cap = FULL_CAP): World => ({ particles: [], emitters: [], cap })

/** Adds a particle unless the world is at its cap. */
export function spawn(world: World, init: ParticleInit): boolean {
  if (world.particles.length >= world.cap) return false
  world.particles.push({
    endSize: init.size,
    alpha: 1,
    gravity: 0,
    drag: 0,
    blend: 'source-over',
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

export const isIdle = (world: World): boolean => world.particles.length === 0 && world.emitters.length === 0

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
  }
  world.particles = world.particles.filter((p) => p.age < p.life)
}

/** How far through its life a particle is, 0 to 1. */
export const progress = (p: Particle): number => Math.min(1, p.age / p.life)

export function colorAt(colors: readonly Rgb[], t: number): Rgb {
  if (t >= 1) return colors[colors.length - 1]
  const scaled = Math.max(0, t) * (colors.length - 1)
  const i = Math.floor(scaled)
  const f = scaled - i
  const [a, b] = [colors[i], colors[i + 1]]
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f]
}

/** What to paint for a particle right now. */
export function look(p: Particle): { radius: number; rgb: Rgb; alpha: number } {
  const t = progress(p)
  return { radius: p.size + (p.endSize - p.size) * t, rgb: colorAt(p.colors, t), alpha: p.alpha * (1 - t) }
}

export const hex = (value: string): Rgb => {
  const n = parseInt(value.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
