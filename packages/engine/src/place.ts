import { hasPiecesInPlay } from './occupancy'
import { BASE } from './position'
import { getPlayer } from './state'
import type { Color, GameState, Move, PieceId, Position } from './types'

/**
 * Put a move's piece where it lands, send any kicked piece to base and settle what follows from it:
 * a Labourer, the kicker sitting out the rest of the turn, a player finishing.
 */
export function place(state: GameState, move: Move): void {
  setPosition(state, move.piece, move.to)
  if (move.kick) {
    setPosition(state, move.kick, BASE)
    if (state.settings.rules.labourer && !hasPiecesInPlay(state, move.kick.color)) {
      state.labourers[move.kick.color] = move.piece.color
      release(state, move.kick.color)
    }
    state.kickers.push(move.piece)
    if (move.piece.color === state.turn) state.kickedThisTurn = true
  }
  if (getPlayer(state, move.piece.color).pieces.every((p) => p.kind === 'home')) finish(state, move.piece.color)
}

/** Free everyone working for `owner`. */
function release(state: GameState, owner: Color): void {
  for (const [victim, holder] of Object.entries(state.labourers) as [Color, Color][]) {
    if (holder === owner) delete state.labourers[victim]
  }
}

export const isKicker = (state: GameState, piece: PieceId): boolean =>
  state.kickers.some((k) => k.color === piece.color && k.index === piece.index)

function setPosition(state: GameState, piece: PieceId, pos: Position): void {
  getPlayer(state, piece.color).pieces[piece.index] = pos
}

function finish(state: GameState, color: Color): void {
  const placed = state.players.filter((p) => p.finishedPlace !== undefined).length
  getPlayer(state, color).finishedPlace = placed + 1
  release(state, color)
  if (state.settings.endCondition === 'firstWins') {
    state.status = 'finished'
    return
  }
  const remaining = state.players.filter((p) => p.finishedPlace === undefined)
  if (remaining.length === 1) {
    remaining[0].finishedPlace = placed + 2
    state.status = 'finished'
  }
}
