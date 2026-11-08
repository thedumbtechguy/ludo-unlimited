import { hex, type Make, type Point } from './particles'

/**
 * Fire colours, hot to cool. No blue in any of them, so where the additive flames pile up they
 * saturate to a deep yellow-orange instead of washing out to white against the white table.
 */
const FLAME = ['#FFE066', '#FFB000', '#F76B15', '#E5400F', '#C42A0C'].map(hex)
const EMBER = ['#FFD34D', '#F76B15', '#C2410C'].map(hex)

export const ON_FIRE_COLOR = '#F76B15'

/** How hot the fire burns for a streak: 0 below three 6s, then one step per extra 6, up to 5. */
export const heat = (count: number): number => (count < 3 ? 0 : Math.min(5, count - 2))

/**
 * Flame tongues rising from a base `width` px wide. Most start near the edges and lean in, so the
 * fire wraps around the dice rather than burying its face. `heat` 1+ makes them taller and wider.
 */
export const flame =
  (width: number, heat: number): Make =>
  (rand) => {
    const u = rand() * 2 - 1
    const side = Math.sign(u) * Math.abs(u) ** 0.45
    const half = width * (0.5 + 0.04 * heat)
    // Tuned on the phone dice (a ~96px base); bigger dice burn bigger.
    const grow = (1 + 0.15 * (heat - 1)) * (width / 96)
    return {
      x: side * half,
      y: -rand() * width * 0.25 * Math.abs(side),
      vx: -side * (20 + rand() * 25) + (rand() - 0.5) * 18,
      vy: -(130 + rand() * 100) * grow,
      life: 0.36 + rand() * 0.24 + 0.02 * heat,
      size: (8 + rand() * 7) * (1 + 0.1 * heat) * (width / 96),
      endSize: 1.5,
      colors: FLAME,
      alpha: 0.75,
      hold: 1.4,
      gravity: -120,
      drag: 2,
      blend: 'lighter',
      shape: 'soft',
    }
  }

/** Flames licking up from a base `width` px wide, behind a line of text `height` px tall ("On fire"). */
export const burner =
  (width: number, height: number): Make =>
  (rand) => {
    const u = rand() * 2 - 1
    return {
      x: u * width * 0.5,
      y: 0,
      vx: -u * 10 + (rand() - 0.5) * 10,
      vy: -(2 + rand() * 1.6) * height,
      life: 0.28 + rand() * 0.16,
      size: (0.22 + rand() * 0.16) * height,
      endSize: 0.05 * height,
      colors: FLAME,
      alpha: 0.95,
      hold: 1.6,
      gravity: -60,
      drag: 1.6,
      blend: 'lighter',
      shape: 'soft',
    }
  }

/** Particles per second for a fire of this heat. */
export const flameRate = (heat: number): number => 110 + 50 * heat

/** A few slow sparks drifting up and off a body `width` px wide. */
export const ember =
  (width: number): Make =>
  (rand) => ({
    x: (rand() - 0.5) * width,
    y: (rand() - 0.5) * width * 0.2,
    vx: (rand() - 0.5) * 24,
    vy: -(28 + rand() * 34),
    life: 1.3 + rand() * 0.9,
    size: 1.4 + rand() * 1.6,
    endSize: 0.6,
    colors: EMBER,
    alpha: 0.95,
    gravity: -12,
    drag: 0.3,
  })

export const emberRate = (count: number): number => (count >= 3 ? 14 : 9)

/** A box's horizontal centre at a fraction of its height, or undefined while it isn't laid out. */
export function anchor(el: Element | null, down: number): Point | undefined {
  const rect = el?.getBoundingClientRect()
  if (!rect || rect.width === 0) return undefined
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height * down }
}
