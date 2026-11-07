import { loneOpponent } from '../occupancy'
import { forwardPath, isClear } from '../path'
import { positionOf } from '../state'
import type { GameState, Move, PieceId } from '../types'

/** Normal move. Landing on a lone opponent kicks it (Front Kick, always on). */
export function forwardMoves(state: GameState, piece: PieceId, roll: number): Move[] {
  const path = forwardPath(piece.color, positionOf(state, piece), roll)
  if (!path || !isClear(state, path, piece.color)) return []
  const to = path[path.length - 1]
  return [{ kind: 'forward', piece, to, kick: loneOpponent(state, to, piece.color) }]
}
