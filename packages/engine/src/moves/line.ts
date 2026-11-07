import { LINE_ACROSS } from '../board'
import { hasOpponent, loneOpponent, piecesAt } from '../occupancy'
import { backwardPath, forwardPath, isClear } from '../path'
import { track } from '../position'
import { positionOf } from '../state'
import type { GameState, Move, PieceId } from '../types'

export function lineMoves(state: GameState, piece: PieceId, roll: number): Move[] {
  const { lineKick, backKick } = state.settings.rules
  if (!lineKick) return []
  const from = positionOf(state, piece)
  const paths = [forwardPath(piece.color, from, roll), backKick ? backwardPath(from, roll) : null]
  return paths.flatMap((path): Move[] => {
    if (!path || !isClear(state, path, piece.color)) return []
    const via = path[path.length - 1]
    if (via.kind !== 'track' || hasOpponent(state, via, piece.color)) return []
    const pair = LINE_ACROSS.get(via.index)
    if (!pair || piecesAt(state, pair.between).length > 0) return []
    const to = track(pair.across)
    const kick = loneOpponent(state, to, piece.color)
    return kick ? [{ kind: 'line', piece, via, to, kick }] : []
  })
}
