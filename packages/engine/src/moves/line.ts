import { LINE_ACROSS, startIndex } from '../board'
import { hasOpponent, loneOpponent, piecesAt } from '../occupancy'
import { backwardPath, forwardPath, isClear } from '../path'
import { track } from '../position'
import { positionOf } from '../state'
import type { GameState, Move, PieceId, Position } from '../types'

export function lineMoves(state: GameState, piece: PieceId, roll: number): Move[] {
  const { lineKick, backKick } = state.settings.rules
  if (!lineKick) return []
  const from = positionOf(state, piece)
  const entering = from.kind === 'base' && roll === 6 ? [track(startIndex(piece.color))] : null
  const backward = backKick ? backwardPath(piece.color, from, roll) : null
  const paths = [entering, forwardPath(piece.color, from, roll), backward]
  return paths.flatMap((path): Move[] => {
    if (!path || !isClear(state, path, piece.color)) return []
    const via = path[path.length - 1]
    if (via.kind !== 'track' || hasOpponent(state, via, piece.color)) return []
    const pair = LINE_ACROSS.get(via.index)
    if (!pair || othersAt(state, pair.between, piece).length > 0) return []
    const to = track(pair.across)
    const kick = loneOpponent(state, to, piece.color)
    return kick ? [{ kind: 'line', piece, via, to, kick }] : []
  })
}

/** Pieces on `pos` other than `mover`, which may be leaving that very square. */
const othersAt = (state: GameState, pos: Position, mover: PieceId): PieceId[] =>
  piecesAt(state, pos).filter((p) => p.color !== mover.color || p.index !== mover.index)
