import type { Point } from './particles'

/** How far each chain reaches from the yard's centre along its diagonal, in board units. */
export const CHAIN_REACH = 72
/** Centre to centre, along the chain. */
export const LINK_PITCH = 15

export type Link = Point & { angle: number; /** Seen face on (an open loop), or edge on (a bar). */ flat: boolean }

/**
 * Two chains crossing over a yard, corner to corner through `centre`: links alternately face on and
 * edge on, like a real chain. Angles in degrees.
 */
export function chainLinks(centre: Point, reach = CHAIN_REACH): Link[] {
  const count = Math.floor((reach * 2 * Math.SQRT2) / LINK_PITCH) | 1
  return [45, -45].flatMap((angle) => {
    const rad = (angle * Math.PI) / 180
    return Array.from({ length: count }, (_, i) => {
      const step = i - (count - 1) / 2
      const along = step * LINK_PITCH
      // Face on at the crossing, so the two chains meet on open loops.
      return { x: centre.x + Math.cos(rad) * along, y: centre.y + Math.sin(rad) * along, angle, flat: step % 2 === 0 }
    })
  })
}
