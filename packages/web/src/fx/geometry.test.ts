import { describe, expect, it } from 'vitest'
import { arcAt, arcControl, arcEase, arcFrames, arcScale, lightning, shakeFrames } from './geometry'

const seq = (...values: number[]) => {
  let i = 0
  return () => values[i++ % values.length]
}

describe('kicked piece arc', () => {
  const from = { x: 100, y: 300 }
  const to = { x: 400, y: 300 }

  it('starts on the square and lands in the yard', () => {
    expect(arcAt(from, to, 0)).toEqual(from)
    expect(arcAt(from, to, 1)).toEqual(to)
    const frames = arcFrames(from, to, 16)
    expect(frames).toHaveLength(16)
    expect(frames[0]).toMatchObject({ ...from, scale: 1 })
    expect(frames[15]).toMatchObject({ ...to, scale: 1 })
  })

  it('bows up the screen, off the straight line by a third of its length plus a little', () => {
    // 300 long: the control point is 120 above the middle, so the curve's top is half that.
    expect(arcControl(from, to)).toEqual({ x: 250, y: 180 })
    expect(arcAt(from, to, 0.5)).toEqual({ x: 250, y: 240 })
    // The same either way round.
    expect(arcControl(to, from).y).toBeCloseTo(180)
  })

  it('bows left on a vertical flight, and stays put with nowhere to go', () => {
    expect(arcControl({ x: 300, y: 100 }, { x: 300, y: 400 }).x).toBeLessThan(300)
    expect(arcControl({ x: 300, y: 400 }, { x: 300, y: 100 }).x).toBeLessThan(300)
    expect(arcControl(from, from)).toEqual(from)
  })

  it('grows towards the top of the flight and eases into the landing', () => {
    expect(arcScale(0)).toBe(1)
    expect(arcScale(0.5)).toBeCloseTo(1.3)
    expect(arcScale(1)).toBe(1)
    expect(arcEase(0.5)).toBeGreaterThan(0.5)
    const xs = arcFrames(from, to, 16).map((f) => f.x)
    // Covers more ground early than late.
    expect(xs[1] - xs[0]).toBeGreaterThan(xs[15] - xs[14])
  })
})

describe('screen shake', () => {
  it('never goes further than its size, dies away and ends at rest', () => {
    const frames = shakeFrames(6, 9, seq(0.1, 0.6, 0.35, 0.8))
    expect(frames).toHaveLength(9)
    for (const { x, y } of frames) expect(Math.hypot(x, y)).toBeLessThanOrEqual(6 + 1e-9)
    expect(Math.hypot(frames[0].x, frames[0].y)).toBeCloseTo(6)
    expect(Math.hypot(frames[6].x, frames[6].y)).toBeLessThan(Math.hypot(frames[1].x, frames[1].y))
    expect(frames[8]).toEqual({ x: 0, y: 0 })
  })
})

describe('lightning', () => {
  const from = { x: 0, y: 0 }
  const to = { x: 200, y: 0 }

  it('runs from square to square in the given number of segments', () => {
    const points = lightning(from, to, 9, 0.12, seq(0.9, 0.1, 0.5))
    expect(points).toHaveLength(10)
    expect(points[0]).toEqual(from)
    expect(points[9]).toEqual(to)
    // Steady progress along the line.
    points.forEach((p, i) => expect(p.x).toBeCloseTo(i * (200 / 9)))
  })

  it('zigzags sideways, never further than the jag allows, and less near the ends', () => {
    const points = lightning(from, to, 8, 0.12, seq(1, 0, 1, 0))
    const offsets = points.map((p) => p.y)
    for (const y of offsets) expect(Math.abs(y)).toBeLessThanOrEqual(24 + 1e-9)
    expect(Math.sign(offsets[1])).not.toBe(Math.sign(offsets[2]))
    expect(Math.abs(offsets[1])).toBeLessThan(Math.abs(offsets[4]))
  })

  it('a fresh crack each time', () => {
    expect(lightning(from, to, 9, 0.12, seq(0.2, 0.8))).not.toEqual(lightning(from, to, 9, 0.12, seq(0.7, 0.3)))
  })
})
