import { legalMoves, outcomeKey } from './legalMoves'
import { hasPiecesInPlay } from './occupancy'
import { BASE } from './position'
import { cloneState, createGame, getPlayer } from './state'
import type { Color, GameEvent, GameState, Move, PieceId, Position, Settings } from './types'

/**
 * Outside `endsTurn` mode a 6 keeps the player rolling; the first non-6 starts playing the rolls in order.
 * In `endsTurn` mode every roll is played straight away.
 */
export function roll(state: GameState, value: number): GameState {
  if (state.status !== 'playing') throw new Error('game is over')
  if (state.pendingRoll !== undefined) throw new Error('roll already pending')
  if (!Number.isInteger(value) || value < 1 || value > 6) throw new Error('invalid roll')
  const next = cloneState(state)
  next.log.push({ type: 'roll', value })
  next.queuedRolls.push(value)
  if (value === 6) delete next.labourers[next.turn]
  if (value === 6 && next.settings.afterKick !== 'endsTurn') return next
  advance(next, value)
  return next
}

export function applyMove(state: GameState, move: Move): GameState {
  if (state.status !== 'playing') throw new Error('game is over')
  const key = outcomeKey(state, move)
  const legal = legalMoves(state).find((m) => outcomeKey(state, m) === key)
  if (!legal) throw new Error('illegal move')
  const next = cloneState(state)
  next.log.push({ type: 'move', move: legal })
  // A combined kick also uses up the queued rolls it added to the pending one.
  const used = next.queuedRolls.splice(0, (legal.rolls ?? 1) - 1)
  const rolled = used.at(-1) ?? state.pendingRoll
  setPosition(next, legal.piece, legal.to)
  if (legal.kick) {
    setPosition(next, legal.kick, BASE)
    if (next.settings.rules.labourer && !hasPiecesInPlay(next, legal.kick.color)) {
      next.labourers[legal.kick.color] = legal.piece.color
    }
  }
  if (legal.kick && legal.piece.color === next.turn) next.kickedThisTurn = true
  if (getPlayer(next, legal.piece.color).pieces.every((p) => p.kind === 'home')) finish(next, legal.piece.color)
  if (next.status !== 'playing' || getPlayer(next, next.turn).finishedPlace !== undefined) next.queuedRolls = []
  advance(next, rolled, legal.kick && legal.piece.color)
  return next
}

/**
 * After a 6, stop rolling and play the rolls so far. No flag is needed: `advance` takes the first
 * playable roll as pending (so `roll` is refused) and ends the turn when the queue runs out.
 * Stopping only cuts this turn's chain of 6s: a kick under `afterKick: 'bonusRoll'` still earns
 * its bonus roll once the queue is played.
 */
export function stopRolling(state: GameState): GameState {
  if (state.status !== 'playing') throw new Error('game is over')
  const rolling = state.pendingRoll === undefined && state.queuedRolls.length > 0
  if (!rolling || state.settings.afterKick === 'endsTurn') throw new Error('not rolling')
  const next = cloneState(state)
  next.log.push({ type: 'stop' })
  advance(next, undefined)
  return next
}

/** Server-side turn timeout: drop any pending roll and move to the next player. */
export function pass(state: GameState): GameState {
  if (state.status !== 'playing') throw new Error('game is over')
  const next = cloneState(state)
  next.log.push({ type: 'pass' })
  next.pendingRoll = undefined
  next.queuedRolls = []
  next.kickedThisTurn = false
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
      case 'stop':
        return stopRolling(state)
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

/**
 * Take the next queued roll that has a legal move as `pendingRoll`, dropping any without one.
 * When the queue runs out, the turn ends. `last` is the roll just played or dropped, and `kicker`
 * the colour that kicked with it, if any; only `endsTurn` mode looks at them.
 */
function advance(state: GameState, last: number | undefined, kicker?: Color): void {
  state.pendingRoll = undefined
  if (state.status !== 'playing') return
  while (state.queuedRolls.length > 0) {
    state.pendingRoll = state.queuedRolls.shift()
    if (legalMoves(state).length > 0) return
    last = state.pendingRoll
    kicker = undefined
    state.pendingRoll = undefined
  }
  endTurn(state, last, kicker)
}

function endTurn(state: GameState, last: number | undefined, kicker?: Color): void {
  const again = getPlayer(state, state.turn).finishedPlace === undefined && rollsAgain(state, last, kicker)
  state.kickedThisTurn = false
  if (!again) state.turn = nextActive(state, state.turn)
}

function rollsAgain(state: GameState, last: number | undefined, kicker?: Color): boolean {
  if (state.settings.afterKick === 'endsTurn') return !kicker && last === 6
  return state.settings.afterKick === 'bonusRoll' && state.kickedThisTurn
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
