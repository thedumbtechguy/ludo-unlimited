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
/** Entering needs exactly a 6, so it never combines. */
const COMBINING: MoveGenerator[] = [forwardMoves, backMoves, lineMoves, homeKickMoves]

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

/**
 * The single-roll moves, then the kicks that combine the pending roll with the next queued rolls.
 * Single-roll moves come first, so a combined move with the same outcome is dropped.
 */
export function legalMoves(state: GameState): Move[] {
  const roll = state.pendingRoll
  if (state.status !== 'playing' || roll === undefined) return []
  const mover = moverFor(state, roll)
  const pieces = getPlayer(state, mover).pieces.map((_, index): PieceId => ({ color: mover, index }))
  const single = pieces.flatMap((piece) => GENERATORS.flatMap((generate) => generate(state, piece, roll)))
  const seen = new Set<string>()
  return [...single, ...combinedKicks(state, pieces, mover)].filter((move) => {
    const key = outcomeKey(state, move)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/** Kicks using the pending roll plus the next 1..n queued rolls as one move. A Labourer owner never combines. */
function combinedKicks(state: GameState, pieces: PieceId[], mover: Color): Move[] {
  if (mover !== state.turn) return []
  let total = state.pendingRoll!
  return state.queuedRolls.flatMap((queued, i) => {
    total += queued
    const steps = total
    return pieces.flatMap((piece) =>
      COMBINING.flatMap((generate) => generate(state, piece, steps))
        .filter((move) => move.kick)
        .map((move) => ({ ...move, rolls: i + 2 })),
    )
  })
}

/** How many squares a move covers: the pending roll plus any queued rolls it combines. */
export const moveSteps = (state: GameState, move: Move): number =>
  state.queuedRolls.slice(0, (move.rolls ?? 1) - 1).reduce((sum, r) => sum + r, state.pendingRoll!)
