import { loneOpponent } from '../occupancy'
import { backwardPath, isClear } from '../path'
import { positionOf } from '../state'
import type { GameState, Move, PieceId } from '../types'

export function backMoves(state: GameState, piece: PieceId, roll: number): Move[] {
  if (!state.settings.rules.backKick) return []
  const path = backwardPath(piece.color, positionOf(state, piece), roll)
  if (!path || !isClear(state, path, piece.color)) return []
  const to = path[path.length - 1]
  const kick = loneOpponent(state, to, piece.color)
  return kick ? [{ kind: 'back', piece, to, kick }] : []
}
