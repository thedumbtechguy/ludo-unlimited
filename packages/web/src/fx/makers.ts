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
