import { entryIndex } from './board'
import { backwardPath, forwardPath } from './path'
import { lane, samePos } from './position'
import { positionOf } from './state'
import type { GameState, Move, Position } from './types'

/** Every square the moving piece visits, in order, ending at `move.to`. For animation. */
export function movePath(state: GameState, move: Move): Position[] {
  const color = move.piece.color
  const from = positionOf(state, move.piece)
  const roll = state.pendingRoll!
  const routes = (steps: number) => [forwardPath(color, from, steps), backwardPath(color, from, steps)]

  switch (move.kind) {
    case 'enter':
      return [move.to]
    case 'forward':
      return forwardPath(color, from, roll)!
    case 'back':
      return backwardPath(color, from, roll)!
    case 'line': {
      if (from.kind === 'base') return [move.via, move.to]
      const toVia = routes(roll).find((path) => path && samePos(path[path.length - 1], move.via))!
      return [...toVia, move.to]
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
