import { describe, expect, it } from 'vitest'
import { boltFlash, burst, colorAt, createWorld, isIdle, look, markProgress, scaledCount, spawn, step, type Emitter, type ParticleInit } from './particles'

const rand = () => 0.5
const dot = (over: Partial<ParticleInit> = {}): ParticleInit => ({ x: 0, y: 0, vx: 0, vy: 0, life: 1, size: 2, colors: [[255, 0, 0]], ...over })
const emitter = (over: Partial<Emitter> = {}): Emitter => ({
  rate: 10,
  at: () => ({ x: 100, y: 50 }),
  make: () => dot(),
  owed: 0,
  done: false,
  ...over,
})

describe('particles', () => {
  it('spawns with defaults and moves by its velocity', () => {
    const world = createWorld()
    spawn(world, dot({ x: 10, y: 20, vx: 100, vy: -50 }))
    expect(world.particles[0]).toMatchObject({ age: 0, endSize: 2, alpha: 1, hold: 2, gravity: 0, blend: 'source-over', shape: 'dot' })
    step(world, 0.1, rand)
    expect(world.particles[0].x).toBeCloseTo(20)
    expect(world.particles[0].y).toBeCloseTo(15)
  })

  it('gravity bends the path and drag slows it', () => {
    const world = createWorld()
    spawn(world, dot({ vy: 0, gravity: 100 }))
    spawn(world, dot({ vx: 100, drag: 0.5 }))
    step(world, 0.1, rand)
    expect(world.particles[0].vy).toBeCloseTo(10)
    expect(world.particles[1].vx).toBeCloseTo(95)
  })

  it('expires at the end of its life', () => {
    const world = createWorld()
    spawn(world, dot({ life: 0.25 }))
    step(world, 0.2, rand)
    expect(world.particles).toHaveLength(1)
    step(world, 0.1, rand)
    expect(world.particles).toHaveLength(0)
    expect(isIdle(world)).toBe(true)
  })

  it('never holds more than its cap', () => {
    const world = createWorld(5)
    expect(burst(world, 0, 0, 8, () => dot(), rand)).toBe(5)
    expect(spawn(world, dot())).toBe(false)
    expect(world.particles).toHaveLength(5)
  })

  it('bursts around the given point', () => {
    const world = createWorld()
    burst(world, 100, 200, 2, () => dot({ x: 3, y: -4 }), rand)
    expect(world.particles.map((p) => [p.x, p.y])).toEqual([
      [103, 196],
      [103, 196],
    ])
  })

  it('emitters spawn at their rate, carrying fractions over', () => {
    const world = createWorld()
    world.emitters.push(emitter({ rate: 10 }))
    step(world, 0.25, rand)
    expect(world.particles).toHaveLength(2)
    step(world, 0.25, rand)
    expect(world.particles).toHaveLength(5)
    expect(world.particles[0]).toMatchObject({ x: 100, y: 50 })
  })

  it('emitters respect the cap', () => {
    const world = createWorld(3)
    world.emitters.push(emitter({ rate: 100 }))
    step(world, 0.1, rand)
    expect(world.particles).toHaveLength(3)
  })

  it('an emitter with nowhere to spawn waits', () => {
    const world = createWorld()
    world.emitters.push(emitter({ at: () => undefined }))
    step(world, 1, rand)
    expect(world.particles).toHaveLength(0)
    expect(isIdle(world)).toBe(false)
  })

  it('a fading emitter dies down, then goes', () => {
    const world = createWorld()
    world.emitters.push(emitter({ rate: 100, fading: { left: 0.6, total: 0.6 } }))
    step(world, 0.3, rand)
    // The rate is halfway down after 0.3s.
    expect(world.particles).toHaveLength(15)
    step(world, 0.3, rand)
    expect(world.emitters).toHaveLength(0)
  })

  it('a stopped emitter goes on the next step', () => {
    const world = createWorld()
    const e = emitter()
    world.emitters.push(e)
    e.done = true
    step(world, 1, rand)
    expect(world.emitters).toHaveLength(0)
    expect(world.particles).toHaveLength(0)
  })

  it('blends colour, size and opacity across the life', () => {
    const world = createWorld()
    spawn(world, dot({ size: 10, endSize: 0, colors: [[255, 255, 0], [255, 0, 0]] }))
    step(world, 0.5, rand)
    const now = look(world.particles[0])
    expect(now.radius).toBeCloseTo(5)
    expect(now.rgb).toEqual([255, 127.5, 0])
    expect(now.alpha).toBeCloseTo(0.75)
    expect(colorAt([[0, 0, 0], [100, 100, 100], [200, 0, 0]], 1)).toEqual([200, 0, 0])
  })
})

describe('one colour', () => {
  it('stays that colour all its life', () => {
    expect(colorAt([[10, 20, 30]], 0)).toEqual([10, 20, 30])
    expect(colorAt([[10, 20, 30]], 0.5)).toEqual([10, 20, 30])
  })
})

describe('a new world', () => {
  it('is idle, with nothing alive and no marks', () => {
    const world = createWorld()
    expect(world.marks).toEqual([])
    expect(isIdle(world)).toBe(true)
  })
})

describe('marks', () => {
  it('a ring waits out its delay, plays for its duration, then is gone and the world is idle', () => {
    const world = createWorld()
    world.marks.push({ kind: 'ring', x: 0, y: 0, from: 1, to: 10, width: 2, rgb: [255, 255, 255], delay: 0.1, duration: 0.3, age: 0 })
    step(world, 0.05, rand)
    expect(markProgress(world.marks[0])).toBeLessThan(0)
    step(world, 0.2, rand)
    expect(markProgress(world.marks[0])).toBeCloseTo(0.5)
    step(world, 0.16, rand)
    expect(world.marks).toEqual([])
    expect(isIdle(world)).toBe(true)
  })

  it('a bolt flickers: lit, dark, lit again, and dark once over', () => {
    expect(boltFlash(0.1, 3)).toBe(0)
    expect(boltFlash(0.3, 3)).toBe(-1)
    expect(boltFlash(0.4, 3)).toBe(1)
    expect(boltFlash(0.7, 3)).toBe(2)
    expect(boltFlash(1, 3)).toBe(-1)
    expect(boltFlash(-0.1, 3)).toBe(-1)
  })
})

describe('reduced effects', () => {
  it('make a tenth of the particles, at least one', () => {
    expect(scaledCount(120, false)).toBe(120)
    expect(scaledCount(120, true)).toBe(12)
    expect(scaledCount(36, true)).toBe(4)
    expect(scaledCount(3, true)).toBe(1)
  })
})
