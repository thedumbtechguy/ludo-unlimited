import { createContext, useContext, useEffect, useMemo, useRef, type ReactNode } from 'react'
import type { EffectsLevel } from '../types'
import { burst, createWorld, FULL_CAP, isIdle, look, REDUCED_CAP, step, type Emitter, type Make, type Particle, type Point, type Rgb } from './particles'

export type EmitterOptions = {
  /** Particles per second (a tenth of it with reduced effects). */
  rate: number
  /** Where to spawn now, in screen (client) px; undefined pauses spawning. */
  at: () => Point | undefined
  make: Make
}

export type EmitterHandle = {
  set: (options: Partial<Omit<EmitterOptions, 'at'>>) => void
  /** Die down over `ms`, then stop. Particles already out live out their lives. */
  fade: (ms: number) => void
  stop: () => void
}

export type Fx = {
  /** False when effects are skipped altogether (instant timing): draw no effect, not even static ones. */
  enabled: boolean
  level: EffectsLevel
  /** `count` particles around a screen point (a tenth of them with reduced effects). */
  burst: (x: number, y: number, count: number, make: Make) => void
  emitter: (options: EmitterOptions) => EmitterHandle
}

const noop = () => {}
const NO_FX: Fx = { enabled: false, level: 'reduced', burst: noop, emitter: () => ({ set: noop, fade: noop, stop: noop }) }
const FxContext = createContext<Fx>(NO_FX)

export const useFx = (): Fx => useContext(FxContext)

/** Longest frame step, so a stall (or a hidden tab coming back) doesn't fling particles. */
const MAX_DT = 1 / 30

/**
 * One canvas over the whole screen that never takes a tap. The loop runs only while something is
 * alive, and pauses while the tab is hidden. `enabled` false gives a layer that draws nothing.
 */
export function FxLayer({ level, enabled = true, children }: { level: EffectsLevel; enabled?: boolean; children: ReactNode }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const world = useRef(createWorld(level === 'full' ? FULL_CAP : REDUCED_CAP))
  const frame = useRef<number>()
  const last = useRef<number>()
  const scale = level === 'full' ? 1 : 0.1

  useEffect(() => {
    world.current.cap = level === 'full' ? FULL_CAP : REDUCED_CAP
  }, [level])

  const { fx, wake } = useMemo(() => {
    const tick = (now: number) => {
      const el = canvas.current
      frame.current = undefined
      if (!el || document.hidden) return
      const dt = last.current === undefined ? 1 / 60 : Math.min(MAX_DT, (now - last.current) / 1000)
      last.current = now
      step(world.current, dt, Math.random)
      draw(el, world.current.particles)
      if (isIdle(world.current)) {
        last.current = undefined
        return
      }
      frame.current = requestAnimationFrame(tick)
    }
    const wake = () => {
      if (frame.current === undefined && !document.hidden) frame.current = requestAnimationFrame(tick)
    }
    if (!enabled) return { fx: { ...NO_FX, level }, wake }
    const fx: Fx = {
      enabled: true,
      level,
      burst: (x, y, count, make) => {
        burst(world.current, x, y, Math.ceil(count * scale), make, Math.random)
        wake()
      },
      emitter: ({ rate, at, make }) => {
        const emitter: Emitter = { rate: rate * scale, at, make, owed: 0, done: false }
        world.current.emitters.push(emitter)
        wake()
        return {
          set: (options) => {
            if (options.rate !== undefined) emitter.rate = options.rate * scale
            if (options.make) emitter.make = options.make
          },
          fade: (ms) => {
            if (!emitter.fading) emitter.fading = { left: ms / 1000, total: ms / 1000 }
          },
          stop: () => {
            emitter.done = true
          },
        }
      },
    }
    return { fx, wake }
  }, [enabled, level, scale])

  // Keep the backing store at the device pixel ratio, and pause with the tab.
  useEffect(() => {
    if (!enabled) return
    const el = canvas.current!
    const resize = () => {
      const dpr = window.devicePixelRatio || 1
      el.width = Math.round(window.innerWidth * dpr)
      el.height = Math.round(window.innerHeight * dpr)
    }
    const visibility = () => {
      last.current = undefined
      if (document.hidden) {
        if (frame.current !== undefined) cancelAnimationFrame(frame.current)
        frame.current = undefined
      } else if (!isIdle(world.current)) {
        wake()
      }
    }
    resize()
    window.addEventListener('resize', resize)
    document.addEventListener('visibilitychange', visibility)
    return () => {
      window.removeEventListener('resize', resize)
      document.removeEventListener('visibilitychange', visibility)
      if (frame.current !== undefined) cancelAnimationFrame(frame.current)
      frame.current = undefined
    }
  }, [enabled, wake])

  return (
    <FxContext.Provider value={fx}>
      {children}
      {enabled && <canvas ref={canvas} className="fx-layer" aria-hidden="true" />}
    </FxContext.Provider>
  )
}

function draw(el: HTMLCanvasElement, particles: Particle[]) {
  const ctx = el.getContext('2d')
  if (!ctx) return
  const dpr = el.width / window.innerWidth
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.clearRect(0, 0, el.width, el.height)
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  for (const p of particles) {
    const { radius, rgb, alpha } = look(p)
    if (radius <= 0 || alpha <= 0) continue
    ctx.globalCompositeOperation = p.blend
    if (p.shape === 'soft') {
      // The puff fades out well inside its box, so draw it larger than the radius.
      const size = radius * 2.6
      ctx.globalAlpha = alpha
      ctx.drawImage(puff(rgb), p.x - size / 2, p.y - size / 2, size, size)
      ctx.globalAlpha = 1
    } else {
      ctx.fillStyle = `rgba(${rgb[0] | 0},${rgb[1] | 0},${rgb[2] | 0},${alpha})`
      ctx.beginPath()
      ctx.arc(p.x, p.y, radius, 0, Math.PI * 2)
      ctx.fill()
    }
  }
}

const PUFF_SIZE = 64
const puffs = new Map<string, HTMLCanvasElement>()

/** A soft round sprite in one colour, made once per (rounded) colour and kept. */
function puff(rgb: Rgb): HTMLCanvasElement {
  const [r, g, b] = rgb.map((c) => Math.round(c / 8) * 8)
  const key = `${r},${g},${b}`
  let sprite = puffs.get(key)
  if (sprite) return sprite
  sprite = document.createElement('canvas')
  sprite.width = sprite.height = PUFF_SIZE
  const ctx = sprite.getContext('2d')!
  const half = PUFF_SIZE / 2
  const gradient = ctx.createRadialGradient(half, half, 0, half, half, half)
  gradient.addColorStop(0, `rgba(${r},${g},${b},1)`)
  gradient.addColorStop(0.5, `rgba(${r},${g},${b},0.8)`)
  gradient.addColorStop(1, `rgba(${r},${g},${b},0)`)
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, PUFF_SIZE, PUFF_SIZE)
  puffs.set(key, sprite)
  return sprite
}
