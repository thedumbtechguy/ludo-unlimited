import { startIndex } from '../board'
import { isOpponentBlock, loneOpponent } from '../occupancy'
import { track } from '../position'
import { positionOf } from '../state'
import type { GameState, Move, PieceId } from '../types'

export function enterMoves(state: GameState, piece: PieceId, roll: number): Move[] {
  if (roll !== 6 || positionOf(state, piece).kind !== 'base') return []
  const to = track(startIndex(piece.color))
  if (isOpponentBlock(state, to, piece.color)) return []
  return [{ kind: 'enter', piece, to, kick: loneOpponent(state, to, piece.color) }]
}
