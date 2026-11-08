import { entryIndex, startIndex } from './board'
import { entersFirst, moveSteps } from './legalMoves'
import { backwardPaths, forwardPath } from './path'
import { lane, samePos, track } from './position'
import { positionOf } from './state'
import type { GameState, Move, Position } from './types'

/** Every square the moving piece visits, in order, ending at `move.to`. For animation. */
export function movePath(state: GameState, move: Move): Position[] {
  if (!entersFirst(state, move)) return walkFrom(state, move, positionOf(state, move.piece))
  const start = track(startIndex(move.piece.color))
  return [start, ...walkFrom(state, move, start)]
}

function walkFrom(state: GameState, move: Move, from: Position): Position[] {
  const color = move.piece.color
  const roll = moveSteps(state, move)
  const routes = (steps: number) => [forwardPath(color, from, steps), ...backwardPaths(color, from, steps)]
  const ending = (steps: number, at: Position) => routes(steps).find((path) => path && samePos(path[path.length - 1], at))!

  switch (move.kind) {
    case 'enter':
      return [move.to]
    case 'forward':
      return forwardPath(color, from, roll)!
    case 'back':
      return ending(roll, move.to)
    case 'line': {
      if (from.kind === 'base') return [move.via, move.to]
      return [...ending(roll, move.via), move.to]
    }
    case 'homeKick': {
      const to = move.to as Extract<Position, { kind: 'lane' }>
      const steps = roll - to.index
      const intoLane = Array.from({ length: to.index }, (_, i) => lane(to.owner, i + 1))
      const route = routes(steps).find((path) => {
        const last = steps === 0 ? from : path?.[path.length - 1]
        return last?.kind === 'track' && last.index === entryIndex(to.owner)
      })!
      return [...route, ...intoLane]
    }
  }
}
