import { LANE_LENGTH, entryIndex } from '../board'
import { loneOpponent } from '../occupancy'
import { backwardPaths, forwardPath, isClear } from '../path'
import { lane } from '../position'
import { positionOf } from '../state'
import { COLORS, type GameState, type Move, type PieceId, type Position } from '../types'

export function homeKickMoves(state: GameState, piece: PieceId, roll: number): Move[] {
  const { homeKick, backKick } = state.settings.rules
  if (!homeKick) return []
  const from = positionOf(state, piece)
  // From an opponent's lane the only way is out; it can't turn back in.
  if (from.kind !== 'track' && !(from.kind === 'lane' && from.owner === piece.color)) return []
  const forward = forwardPath(piece.color, from, roll - 1)
  const backward = backKick ? backwardPaths(piece.color, from, roll - 1) : []
  return [
    ...(forward ? turnsIn(state, piece, roll, [from, ...forward], false) : []),
    ...backward.flatMap((steps) => turnsIn(state, piece, roll, [from, ...steps], from.kind === 'track')),
  ]
}

/**
 * route[k] is where the piece stands after k steps; at another colour's entry it may turn into that
 * lane. `ownLane`: a count back from the start side may also turn into the piece's own lane (coming
 * home forward, it goes in anyway).
 */
function turnsIn(state: GameState, piece: PieceId, roll: number, route: Position[], ownLane: boolean): Move[] {
  return route.flatMap((pos, k): Move[] => {
    if (pos.kind !== 'track') return []
    const index = pos.index
    const owner = COLORS.find((c) => (c !== piece.color || (ownLane && k > 0)) && entryIndex(c) === index)
    const depth = roll - k
    if (!owner || depth > LANE_LENGTH) return []
    const to = lane(owner, depth)
    const path = [...route.slice(1, k + 1), ...Array.from({ length: depth }, (_, i) => lane(owner, i + 1))]
    const kick = loneOpponent(state, to, piece.color)
    return kick && isClear(state, path, piece.color) ? [{ kind: 'homeKick', piece, to, kick }] : []
  })
}
