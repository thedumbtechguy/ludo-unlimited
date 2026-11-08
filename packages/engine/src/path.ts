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

/** One step back along `color`'s route: back along the track, or back out of its own lane (wicked move). */
export function stepBackward(color: Color, pos: Position): Position | null {
  switch (pos.kind) {
    case 'track':
      return track((pos.index - 1 + TRACK_LENGTH) % TRACK_LENGTH)
    case 'lane':
      if (pos.owner !== color) return null
      return pos.index > 1 ? lane(color, pos.index - 1) : track(entryIndex(color))
    default:
      return null
  }
}

type Step = (color: Color, pos: Position) => Position | null

/** Squares visited after each step, or null if the route runs out. */
function walk(step: Step, color: Color, from: Position, steps: number): Position[] | null {
  const path: Position[] = []
  let pos = from
  for (let i = 0; i < steps; i++) {
    const next = step(color, pos)
    if (!next) return null
    path.push(next)
    pos = next
  }
  return path
}

/** Null if the route runs out (e.g. overshooting home). */
export const forwardPath = (color: Color, from: Position, steps: number): Position[] | null =>
  walk(stepForward, color, from, steps)

export const backwardPath = (color: Color, from: Position, steps: number): Position[] | null =>
  walk(stepBackward, color, from, steps)

/**
 * Every way to count `steps` back. Counting back out of its own lane, a piece may turn either way at
 * the tip: back along the arm it came in on (entry − 1 …), or on round the far side past its entrance
 * (entry + 1, its start square …). Anywhere else there is just the one way back.
 */
export function backwardPaths(color: Color, from: Position, steps: number): Position[][] {
  const paths = [backwardPath(color, from, steps)].filter((path) => path !== null)
  if (from.kind !== 'lane' || from.owner !== color || steps <= from.index) return paths
  const out = backwardPath(color, from, from.index)!
  const round = Array.from({ length: steps - from.index }, (_, i) => track((entryIndex(color) + 1 + i) % TRACK_LENGTH))
  return [...paths, [...out, ...round]]
}

export const isClear = (state: GameState, path: Position[], mover: Color): boolean =>
  path.every((pos) => !isOpponentBlock(state, pos, mover))
