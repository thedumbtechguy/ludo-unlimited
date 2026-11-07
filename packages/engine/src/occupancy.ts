import { isOnBoard, posKey } from './position'
import type { Color, GameState, PieceId, Position } from './types'

export function piecesAt(state: GameState, pos: Position): PieceId[] {
  if (pos.kind === 'base' || pos.kind === 'home') return []
  const key = posKey(pos)
  return state.players.flatMap((player) =>
    player.pieces.flatMap((p, index) => (posKey(p) === key ? [{ color: player.color, index }] : [])),
  )
}

/** Two or more pieces of one opponent colour. Squares never hold two colours. */
export function isOpponentBlock(state: GameState, pos: Position, mover: Color): boolean {
  const here = piecesAt(state, pos)
  return here.length >= 2 && here[0].color !== mover
}

export function loneOpponent(state: GameState, pos: Position, mover: Color): PieceId | undefined {
  const here = piecesAt(state, pos)
  return here.length === 1 && here[0].color !== mover ? here[0] : undefined
}

export const hasOpponent = (state: GameState, pos: Position, mover: Color): boolean =>
  piecesAt(state, pos).some((p) => p.color !== mover)

export const hasPiecesInPlay = (state: GameState, color: Color): boolean =>
  state.players.some((p) => p.color === color && p.pieces.some(isOnBoard))
