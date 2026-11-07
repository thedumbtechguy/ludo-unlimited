import { backMoves } from './moves/back'
import { enterMoves } from './moves/enter'
import { forwardMoves } from './moves/forward'
import { homeKickMoves } from './moves/homeKick'
import { lineMoves } from './moves/line'
import { posKey } from './position'
import { getPlayer, positionOf } from './state'
import type { Color, GameState, Move, PieceId } from './types'

type MoveGenerator = (state: GameState, piece: PieceId, roll: number) => Move[]

const GENERATORS: MoveGenerator[] = [enterMoves, forwardMoves, backMoves, lineMoves, homeKickMoves]

/**
 * Moves with the same key have the same result, so the player sees only one.
 * Keyed on the starting square, not the piece, so stacked pieces don't offer twin choices.
 */
export function outcomeKey(state: GameState, move: Move): string {
  const kick = move.kick ? `${move.kick.color}${move.kick.index}` : '-'
  return `${move.piece.color}@${posKey(positionOf(state, move.piece))}>${posKey(move.to)}x${kick}`
}

const moverFor = (state: GameState, roll: number): Color =>
  roll < 6 ? (state.labourers[state.turn] ?? state.turn) : state.turn

/** Whose pieces the pending roll moves: the Labourer owner for a victim's roll under 6. */
export function currentMover(state: GameState): Color | undefined {
  return state.pendingRoll === undefined ? undefined : moverFor(state, state.pendingRoll)
}

export function legalMoves(state: GameState): Move[] {
  const roll = state.pendingRoll
  if (state.status !== 'playing' || roll === undefined) return []
  const mover = moverFor(state, roll)
  const seen = new Set<string>()
  return getPlayer(state, mover)
    .pieces.flatMap((_, index) => GENERATORS.flatMap((generate) => generate(state, { color: mover, index }, roll)))
    .filter((move) => {
      const key = outcomeKey(state, move)
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
}
