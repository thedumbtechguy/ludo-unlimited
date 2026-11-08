import { hex, type Make, type Rgb } from './particles'

/** Particle makers for the board's moments. `u` is screen px per board unit, so effects scale with the board. */

const WHITE: Rgb = [255, 255, 255]

/** A deeper shade of a colour, for the ends of a particle's life (sparks cool as they go). */
export const deepen = ([r, g, b]: Rgb, by = 0.55): Rgb => [r * by, g * by, b * by]

/** Fast sparks flung out from a square in the kicker's colour; some streak, some are hot dots. */
export const spark =
  (color: string, u: number): Make =>
  (rand) => {
    const rgb = hex(color)
    const angle = rand() * Math.PI * 2
    const speed = (260 + rand() * 360) * u
    const streak = rand() < 0.55
    return {
      x: Math.cos(angle) * 6 * u,
      y: Math.sin(angle) * 6 * u,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 0.32 + rand() * 0.28,
      size: (streak ? 3.6 : 4 + rand() * 2.5) * u,
      endSize: 0.6 * u,
      colors: rand() < 0.2 ? [WHITE, rgb] : [rgb, rgb, deepen(rgb)],
      gravity: 240 * u,
      drag: 4.2,
      hold: 1.5,
      shape: streak ? 'streak' : 'dot',
      stretch: 0.045,
    }
  }

/** The kicked piece's trail: small dots in its colour, left behind and shrinking fast. */
export const trail =
  (color: string, u: number): Make =>
  (rand) => ({
    x: (rand() - 0.5) * 6 * u,
    y: (rand() - 0.5) * 6 * u,
    vx: 0,
    vy: 0,
    life: 0.22 + rand() * 0.1,
    size: (5 + rand() * 3) * u,
    endSize: 0.5 * u,
    colors: [hex(color)],
    alpha: 0.7,
    hold: 1,
  })

/**
 * Speed lines streaming back off a piece that whipped along direction (`dx`, `dy`), a unit vector:
 * dark strokes spread across its width, flying the opposite way.
 */
export const speedLine =
  (dx: number, dy: number, u: number): Make =>
  (rand) => {
    const across = (rand() - 0.5) * 34 * u
    const speed = (520 + rand() * 300) * u
    return {
      x: -dy * across - dx * 10 * u,
      y: dx * across - dy * 10 * u,
      vx: -dx * speed,
      vy: -dy * speed,
      life: 0.16 + rand() * 0.1,
      size: (1.4 + rand() * 0.8) * u,
      colors: [hex('#1d1d1f')],
      alpha: 0.6,
      hold: 1.2,
      drag: 4,
      shape: 'streak',
      stretch: 0.09,
    }
  }

const SMOKE = ['#3a3a3e', '#2b2b2e', '#5a5a60'].map(hex)

/** Dark smoke rolling up slowly around a square: the wicked move. */
export const smoke =
  (u: number): Make =>
  (rand) => {
    const angle = rand() * Math.PI * 2
    const r = (8 + rand() * 26) * u
    return {
      x: Math.cos(angle) * r,
      y: Math.sin(angle) * r * 0.7,
      vx: Math.cos(angle) * (20 + rand() * 30) * u,
      vy: -(45 + rand() * 60) * u,
      life: 1 + rand() * 0.7,
      size: (6 + rand() * 6) * u,
      endSize: (18 + rand() * 10) * u,
      colors: SMOKE,
      alpha: 0.38,
      hold: 1.3,
      gravity: -20 * u,
      drag: 0.8,
      shape: 'soft',
    }
  }

/**
 * Broken chain: shards in the chain's colour (the Labourer's owner), from anywhere along the two
 * chains crossing a yard (`reach` px
 * from its centre along each axis), thrown outwards, tumbling and falling.
 */
export const shard =
  (color: string, reach: number, u: number): Make =>
  (rand) => {
    const rgb = hex(color)
    const d = (rand() * 2 - 1) * reach
    const sign = rand() < 0.5 ? 1 : -1
    const x = d
    const y = sign * d
    const out = Math.atan2(y, x) + (rand() - 0.5) * 1.6
    const speed = (50 + rand() * 130) * u
    return {
      x,
      y,
      vx: Math.cos(out) * speed,
      vy: Math.sin(out) * speed - 140 * u,
      life: 0.5 + rand() * 0.3,
      size: (3.5 + rand() * 3) * u,
      colors: rand() < 0.25 ? [WHITE, rgb] : [rgb, rgb, deepen(rgb, 0.7)],
      hold: 3,
      gravity: 900 * u,
      drag: 1.2,
      shape: 'rect',
      aspect: 0.55,
      angle: rand() * Math.PI,
      spin: (rand() - 0.5) * 24,
    }
  }

/** A fountain of sparkles thrown up from a point and falling back: a piece home. */
export const sparkle =
  (color: string, u: number): Make =>
  (rand) => {
    const rgb = hex(color)
    return {
      x: (rand() - 0.5) * 10 * u,
      y: 0,
      vx: (rand() - 0.5) * 240 * u,
      vy: -(330 + rand() * 200) * u,
      life: 0.65 + rand() * 0.35,
      size: (2.8 + rand() * 2.2) * u,
      endSize: 0.8 * u,
      colors: rand() < 0.3 ? [WHITE, rgb] : [rgb, rgb, deepen(rgb, 0.7)],
      hold: 2.5,
      gravity: 720 * u,
      drag: 0.6,
    }
  }

/** One short radial pop in a colour, with some white: a player finishing. */
export const pop =
  (color: string, u: number): Make =>
  (rand) => {
    const rgb = hex(color)
    const angle = rand() * Math.PI * 2
    const speed = (150 + rand() * 200) * u
    return {
      x: Math.cos(angle) * 20 * u,
      y: Math.sin(angle) * 20 * u,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 0.45 + rand() * 0.3,
      size: (3 + rand() * 2.5) * u,
      endSize: 0.8 * u,
      colors: rand() < 0.35 ? [WHITE, rgb] : [rgb, deepen(rgb, 0.75)],
      hold: 2,
      gravity: 220 * u,
      drag: 3,
    }
  }

/**
 * A firework rocket rising `rise` px from where it's launched over `life` seconds against gravity,
 * then bursting into `count` of `burst` (see `pop` on a particle).
 */
export function rocket(rise: number, life: number, u: number, burst: Make, count: number): Make {
  const gravity = 260 * u
  const vy = (-rise - 0.5 * gravity * life * life) / life
  return (rand) => ({
    x: 0,
    y: 0,
    vx: (rand() - 0.5) * 30 * u,
    vy,
    life,
    size: 2.6 * u,
    endSize: 2 * u,
    colors: [WHITE],
    hold: 8,
    gravity,
    shape: 'streak',
    stretch: 0.05,
    pop: { count, make: burst },
  })
}

/** A firework's burst: a round shell of sparks in the winner's colour and white, drooping as it fades. */
export const shell =
  (color: string, u: number): Make =>
  (rand) => {
    const rgb = hex(color)
    const angle = rand() * Math.PI * 2
    // Most sparks near full speed, so the shell reads as a ring rather than a blob.
    const speed = (230 + (1 - rand() ** 3) * 170) * u
    return {
      x: 0,
      y: 0,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 0.7 + rand() * 0.3,
      size: (3 + rand() * 1.6) * u,
      endSize: 0.8 * u,
      colors: rand() < 0.4 ? [WHITE, WHITE, rgb] : [rgb, rgb, deepen(rgb, 0.7)],
      hold: 2.5,
      gravity: 170 * u,
      drag: 2.2,
      shape: rand() < 0.4 ? 'streak' : 'dot',
      stretch: 0.03,
    }
  }

/**
 * Confetti across the top of a board `width` px wide: flat strips in the four player colours,
 * fluttering down and spinning, all gone in under 1.5s.
 */
export const confetti =
  (colors: readonly string[], width: number, u: number): Make =>
  (rand) => ({
    x: (rand() - 0.5) * width,
    y: -rand() * 40 * u,
    vx: (rand() - 0.5) * 120 * u,
    vy: (90 + rand() * 110) * u,
    life: 2.8 + rand() * 0.8,
    size: (4 + rand() * 2) * u,
    colors: [hex(colors[Math.floor(rand() * colors.length)])],
    hold: 6,
    gravity: 150 * u,
    drag: 1.3,
    shape: 'rect',
    aspect: 0.45,
    angle: rand() * Math.PI,
    spin: (rand() - 0.5) * 18,
  })
