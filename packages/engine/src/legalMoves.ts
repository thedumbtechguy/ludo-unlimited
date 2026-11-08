import { startIndex } from './board'
import { backMoves } from './moves/back'
import { enterMoves } from './moves/enter'
import { forwardMoves } from './moves/forward'
import { homeKickMoves } from './moves/homeKick'
import { lineMoves } from './moves/line'
import { isOpponentBlock, loneOpponent } from './occupancy'
import { posKey, track } from './position'
import { cloneState, getPlayer, positionOf } from './state'
import type { Color, GameState, Move, PieceId } from './types'

type MoveGenerator = (state: GameState, piece: PieceId, roll: number) => Move[]

const GENERATORS: MoveGenerator[] = [enterMoves, forwardMoves, backMoves, lineMoves, homeKickMoves]
/** Entering needs exactly a 6, so it is never part of the summed steps; see `enterThenKicks`. */
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
  const combined = [...combinedKicks(state, pieces, mover), ...enterThenKicks(state, pieces, mover)]
  return [...single, ...combined].filter((move) => {
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

/**
 * A pending 6 enters a piece from base, then the next 1..n queued rolls move it on from the start
 * square, as one move, if that kicks. An enter that already kicks on the start square stops there.
 */
function enterThenKicks(state: GameState, pieces: PieceId[], mover: Color): Move[] {
  if (mover !== state.turn || state.pendingRoll !== 6) return []
  const start = track(startIndex(mover))
  if (isOpponentBlock(state, start, mover) || loneOpponent(state, start, mover)) return []
  let steps = 0
  return state.queuedRolls.flatMap((queued, i) => {
    steps += queued
    return pieces
      .filter((piece) => positionOf(state, piece).kind === 'base')
      .flatMap((piece) => {
        const entered = cloneState(state)
        getPlayer(entered, mover).pieces[piece.index] = start
        return COMBINING.flatMap((generate) => generate(entered, piece, steps))
          .filter((move) => move.kick)
          .map((move) => ({ ...move, rolls: i + 2 }))
      })
  })
}

/**
 * How many squares a move covers: the pending roll plus any queued rolls it combines.
 * For a combined move from base the pending 6 enters, so only the queued rolls count.
 */
export function moveSteps(state: GameState, move: Move): number {
  const total = state.queuedRolls.slice(0, (move.rolls ?? 1) - 1).reduce((sum, r) => sum + r, state.pendingRoll!)
  return entersFirst(state, move) ? total - 6 : total
}

/** A combined move by a piece in base: it enters on the pending 6, then moves on. */
export const entersFirst = (state: GameState, move: Move): boolean =>
  (move.rolls ?? 1) > 1 && positionOf(state, move.piece).kind === 'base'
