import { piecesAt } from './occupancy'
import { positionOf } from './state'
import type { Color, GameEvent, GameState, Move, PieceId, Position } from './types'

export type KickKind = 'front' | 'back' | 'line' | 'home' | 'wicked'

/** The moments worth celebrating on screen, derived from a state change so every screen agrees. */
export type GameEffect =
  | { type: 'kick'; kind: KickKind; at: Position; kicker: PieceId; victim: PieceId }
  /** The turn player's run of 6s in this rolling phase; one per 6 rolled. */
  | { type: 'sixStreak'; color: Color; count: number }
  /** A run of 2 or more 6s came to an end. */
  | { type: 'streakEnded'; color: Color; count: number }
  | { type: 'labourerStart'; victim: Color; owner: Color }
  | { type: 'labourerFreed'; victim: Color }
  | { type: 'blockFormed'; color: Color; at: Position }
  | { type: 'pieceHome'; piece: PieceId }
  | { type: 'playerFinished'; color: Color; place: number }
  | { type: 'gameOver' }

/**
 * The effects of a roll, or of stopping (`after` is then `stopRolling(before)`): a Labourer freed by a 6,
 * the six streak growing, or the streak ending on a non-6 or a stop.
 */
export function describeRoll(before: GameState, after: GameState): GameEffect[] {
  const color = before.turn
  const event = after.log.at(-1)
  const effects: GameEffect[] = []
  if (event?.type === 'stop') {
    pushEnded(effects, color, before.queuedRolls.length)
    return effects
  }
  if (event?.type !== 'roll') return effects
  if (before.labourers[color] && !after.labourers[color]) effects.push({ type: 'labourerFreed', victim: color })
  if (event.value === 6) {
    effects.push({ type: 'sixStreak', color, count: streak(after) })
  } else {
    pushEnded(effects, color, streak(before))
  }
  return effects
}

export function describeMove(before: GameState, move: Move, after: GameState): GameEffect[] {
  const effects: GameEffect[] = []
  if (move.kick) {
    effects.push({ type: 'kick', kind: kickKind(before, move), at: move.to, kicker: move.piece, victim: move.kick })
    const owner = after.labourers[move.kick.color]
    if (owner && before.labourers[move.kick.color] !== owner) {
      effects.push({ type: 'labourerStart', victim: move.kick.color, owner })
    }
  }
  const joined = piecesAt(before, move.to)
  if (joined.length === 1 && joined[0].color === move.piece.color) {
    effects.push({ type: 'blockFormed', color: move.piece.color, at: move.to })
  }
  if (move.to.kind === 'home') effects.push({ type: 'pieceHome', piece: move.piece })
  for (const victim of Object.keys(before.labourers) as Color[]) {
    if (!after.labourers[victim]) effects.push({ type: 'labourerFreed', victim })
  }
  after.players
    .filter((p) => p.finishedPlace !== undefined && before.players.find((q) => q.color === p.color)!.finishedPlace === undefined)
    .sort((a, b) => a.finishedPlace! - b.finishedPlace!)
    .forEach((p) => effects.push({ type: 'playerFinished', color: p.color, place: p.finishedPlace! }))
  if (before.status === 'playing' && after.status === 'finished') effects.push({ type: 'gameOver' })
  // In endsTurn mode a streak lives across moves; a kick on a 6 hands the turn on and ends it.
  if (before.settings.afterKick === 'endsTurn' && before.pendingRoll === 6 && after.turn !== before.turn) {
    pushEnded(effects, before.turn, streak(before))
  }
  return effects
}

function pushEnded(effects: GameEffect[], color: Color, count: number): void {
  if (count >= 2) effects.push({ type: 'streakEnded', color, count })
}

function kickKind(before: GameState, move: Move): KickKind {
  switch (move.kind) {
    case 'enter':
    case 'forward':
      return 'front'
    case 'back': {
      const from = positionOf(before, move.piece)
      return from.kind === 'lane' && from.owner === move.piece.color ? 'wicked' : 'back'
    }
    case 'line':
      return 'line'
    case 'homeKick':
      return 'home'
  }
}

/**
 * The turn player's current run of 6s. Rolling your sixes first, that is every roll queued so far
 * (each one a 6, or rolling would have stopped). In `endsTurn` mode each 6 is played before the next
 * roll, so count back through the log, over the turn player's own moves, to where their turn began.
 */
function streak(state: GameState): number {
  if (state.settings.afterKick !== 'endsTurn') {
    return state.pendingRoll === undefined ? state.queuedRolls.length : 0
  }
  let count = 0
  for (let i = state.log.length - 1; i >= 0; i--) {
    const event: GameEvent = state.log[i]
    if (event.type === 'roll' && event.value === 6) count++
    else if (event.type === 'move' && event.move.piece.color === state.turn && !event.move.kick) continue
    else break
  }
  return count
}
