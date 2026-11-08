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
    const across = (rand() - 0.5) * 30 * u
    const speed = (420 + rand() * 260) * u
    return {
      x: -dy * across - dx * 10 * u,
      y: dx * across - dy * 10 * u,
      vx: -dx * speed,
      vy: -dy * speed,
      life: 0.16 + rand() * 0.1,
      size: (2 + rand() * 1.2) * u,
      colors: [hex('#1d1d1f')],
      alpha: 0.75,
      hold: 1.2,
      drag: 5,
      shape: 'streak',
      stretch: 0.07,
    }
  }

const SMOKE = ['#3a3a3e', '#2b2b2e', '#5a5a60'].map(hex)

/** Dark smoke rolling up slowly around a square: the wicked move. */
export const smoke =
  (u: number): Make =>
  (rand) => {
    const angle = rand() * Math.PI * 2
    const r = rand() * 22 * u
    return {
      x: Math.cos(angle) * r,
      y: Math.sin(angle) * r * 0.7,
      vx: (rand() - 0.5) * 40 * u,
      vy: -(30 + rand() * 50) * u,
      life: 0.9 + rand() * 0.7,
      size: (9 + rand() * 7) * u,
      endSize: (22 + rand() * 12) * u,
      colors: SMOKE,
      alpha: 0.6,
      hold: 1.3,
      gravity: -20 * u,
      drag: 0.8,
      shape: 'soft',
    }
  }
