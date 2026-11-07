import { backMoves } from './moves/back'
import { enterMoves } from './moves/enter'
import { forwardMoves } from './moves/forward'
import { lineMoves } from './moves/line'
import { posKey } from './position'
import { getPlayer } from './state'
import type { GameState, Move, PieceId } from './types'

type MoveGenerator = (state: GameState, piece: PieceId, roll: number) => Move[]

const GENERATORS: MoveGenerator[] = [enterMoves, forwardMoves, backMoves, lineMoves]

/** Moves with the same key have the same result; the player sees only one. */
export function outcomeKey(move: Move): string {
  const kick = move.kick ? `${move.kick.color}${move.kick.index}` : '-'
  return `${move.piece.color}${move.piece.index}>${posKey(move.to)}x${kick}`
}

export function legalMoves(state: GameState): Move[] {
  const roll = state.pendingRoll
  if (state.status !== 'playing' || roll === undefined) return []
  const mover = state.turn
  const seen = new Set<string>()
  return getPlayer(state, mover)
    .pieces.flatMap((_, index) => GENERATORS.flatMap((generate) => generate(state, { color: mover, index }, roll)))
    .filter((move) => {
      const key = outcomeKey(move)
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
}
