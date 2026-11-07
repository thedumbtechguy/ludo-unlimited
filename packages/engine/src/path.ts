import { LANE_LENGTH, TRACK_LENGTH, entryIndex } from './board'
import { isOpponentBlock } from './occupancy'
import { HOME, lane, track } from './position'
import type { Color, GameState, Position } from './types'

/** One step along `color`'s route. Route depends only on position (no lap counting). */
export function stepForward(color: Color, pos: Position): Position | null {
  switch (pos.kind) {
    case 'track':
      return pos.index === entryIndex(color) ? lane(color, 1) : track((pos.index + 1) % TRACK_LENGTH)
    case 'lane':
      if (pos.owner === color) return pos.index < LANE_LENGTH ? lane(color, pos.index + 1) : HOME
      return pos.index > 1 ? lane(pos.owner, pos.index - 1) : track(entryIndex(pos.owner))
    default:
      return null
  }
}

/** Squares visited after each step, or null if the route runs out (e.g. overshooting home). */
export function forwardPath(color: Color, from: Position, steps: number): Position[] | null {
  const path: Position[] = []
  let pos = from
  for (let i = 0; i < steps; i++) {
    const next = stepForward(color, pos)
    if (!next) return null
    path.push(next)
    pos = next
  }
  return path
}

/** Backwards along the track only. */
export function backwardPath(from: Position, steps: number): Position[] | null {
  if (from.kind !== 'track') return null
  return Array.from({ length: steps }, (_, i) => track((from.index - i - 1 + TRACK_LENGTH) % TRACK_LENGTH))
}

export const isClear = (state: GameState, path: Position[], mover: Color): boolean =>
  path.every((pos) => !isOpponentBlock(state, pos, mover))
