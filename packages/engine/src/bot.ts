import { legalMoves } from './legalMoves'
import { progress } from './progress'
import type { GameState, Move } from './types'

/** Higher is better: finish > kick > enter > furthest destination. */
function score(move: Move): number {
  if (move.to.kind === 'home') return 3000
  if (move.kick) return 2000
  if (move.kind === 'enter') return 1000
  return progress(move.piece.color, move.to)
}

/** The sensible bot: the best-scoring legal move, ties broken by `random` (0 ≤ r < 1). */
export function chooseMove(state: GameState, random: () => number): Move | undefined {
  const moves = legalMoves(state)
  if (moves.length === 0) return undefined
  const best = Math.max(...moves.map(score))
  const top = moves.filter((m) => score(m) === best)
  return top[Math.floor(random() * top.length)]
}
