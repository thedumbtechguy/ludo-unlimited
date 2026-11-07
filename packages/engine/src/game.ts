import { legalMoves, outcomeKey } from './legalMoves'
import { hasPiecesInPlay } from './occupancy'
import { BASE } from './position'
import { cloneState, createGame, getPlayer } from './state'
import type { Color, GameEvent, GameState, Move, PieceId, Position, Settings } from './types'

export function roll(state: GameState, value: number): GameState {
  if (state.status !== 'playing') throw new Error('game is over')
  if (state.pendingRoll !== undefined) throw new Error('roll already pending')
  if (!Number.isInteger(value) || value < 1 || value > 6) throw new Error('invalid roll')
  const next = cloneState(state)
  next.log.push({ type: 'roll', value })
  next.pendingRoll = value
  if (value === 6) delete next.labourers[next.turn]
  if (legalMoves(next).length === 0) endTurn(next, value)
  return next
}

export function applyMove(state: GameState, move: Move): GameState {
  if (state.status !== 'playing') throw new Error('game is over')
  const key = outcomeKey(state, move)
  const legal = legalMoves(state).find((m) => outcomeKey(state, m) === key)
  if (!legal) throw new Error('illegal move')
  const rolled = state.pendingRoll
  const next = cloneState(state)
  next.log.push({ type: 'move', move: legal })
  setPosition(next, legal.piece, legal.to)
  if (legal.kick) {
    setPosition(next, legal.kick, BASE)
    if (next.settings.rules.labourer && !hasPiecesInPlay(next, legal.kick.color)) {
      next.labourers[legal.kick.color] = legal.piece.color
    }
  }
  if (getPlayer(next, legal.piece.color).pieces.every((p) => p.kind === 'home')) finish(next, legal.piece.color)
  endTurn(next, rolled)
  return next
}

/** Server-side turn timeout: drop any pending roll and move to the next player. */
export function pass(state: GameState): GameState {
  if (state.status !== 'playing') throw new Error('game is over')
  const next = cloneState(state)
  next.log.push({ type: 'pass' })
  next.pendingRoll = undefined
  next.turn = nextActive(next, next.turn)
  return next
}

export function replay(settings: Settings, log: GameEvent[]): GameState {
  return log.reduce<GameState>((state, event) => {
    switch (event.type) {
      case 'roll':
        return roll(state, event.value)
      case 'move':
        return applyMove(state, event.move)
      case 'pass':
        return pass(state)
    }
  }, createGame(settings))
}

function setPosition(state: GameState, piece: PieceId, pos: Position): void {
  getPlayer(state, piece.color).pieces[piece.index] = pos
}

function nextActive(state: GameState, after: Color): Color {
  const seats = state.players
  const start = seats.findIndex((p) => p.color === after)
  for (let i = 1; i <= seats.length; i++) {
    const player = seats[(start + i) % seats.length]
    if (player.finishedPlace === undefined) return player.color
  }
  return after
}

function endTurn(state: GameState, rolled: number | undefined): void {
  state.pendingRoll = undefined
  if (state.status !== 'playing') return
  if (rolled === 6 && getPlayer(state, state.turn).finishedPlace === undefined) return
  state.turn = nextActive(state, state.turn)
}

function finish(state: GameState, color: Color): void {
  const placed = state.players.filter((p) => p.finishedPlace !== undefined).length
  getPlayer(state, color).finishedPlace = placed + 1
  for (const [victim, owner] of Object.entries(state.labourers) as [Color, Color][]) {
    if (owner === color) delete state.labourers[victim]
  }
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
