import type { Move } from '@ludo/engine'

const samePiece = (a: Move, b: Move) => a.piece.color === b.piece.color && a.piece.index === b.piece.index

/**
 * The moves that are genuinely different choices. A combined forward move that doesn't kick ends
 * where playing its rolls one by one with the same piece would end, so when that piece can make a
 * plain single-roll move too, the combined move is a shortcut rather than a separate choice.
 * Used to decide when a human has nothing to choose (so the move plays itself).
 */
export function realChoices(moves: Move[]): Move[] {
  return moves.filter(
    (move) =>
      !(
        (move.rolls ?? 1) > 1 &&
        move.kind === 'forward' &&
        !move.kick &&
        moves.some((single) => (single.rolls ?? 1) === 1 && !single.kick && samePiece(single, move))
      ),
  )
}
