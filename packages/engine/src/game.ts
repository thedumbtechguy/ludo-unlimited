import { legalMoves, outcomeKey } from './legalMoves'
import { place } from './place'
import { cloneState, createGame, getPlayer } from './state'
import type { Color, GameEvent, GameState, Move, Settings } from './types'

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
  if (value === 6) {
    delete next.labourers[next.turn]
    // A 6 earns another roll only if it can be played. One that can't is lost, the rolling stops,
    // and any 6s rolled before it are played as usual.
    if (!sixPlays(next)) {
      next.queuedRolls.pop()
      advance(next, undefined)
      return next
    }
    if (next.settings.afterKick !== 'endsTurn') return next
  }
  advance(next, value)
  return next
}

/** Whether a 6 has a legal move on the board as it stands now. */
const sixPlays = (state: GameState): boolean => legalMoves({ ...state, pendingRoll: 6, queuedRolls: [] }).length > 0

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
  place(next, legal)
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
  next.kickers = []
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
  state.kickers = []
  if (!again) state.turn = nextActive(state, state.turn)
}

function rollsAgain(state: GameState, last: number | undefined, kicker?: Color): boolean {
  if (state.settings.afterKick === 'endsTurn') return !kicker && last === 6
  return state.settings.afterKick === 'bonusRoll' && state.kickedThisTurn
}
