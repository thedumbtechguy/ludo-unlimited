import { track } from '../src/position'
import { createGame } from '../src/state'
import type { Color, GameState, PieceId, Position, Rules, Settings } from '../src/types'

type Spot = number | Position

export type SetupOptions = {
  players?: Settings['players']
  rules?: Partial<Rules>
  endCondition?: Settings['endCondition']
  turn?: Color
  /** Sets pendingRoll directly, skipping roll(). */
  roll?: number
  /** A number is a track index; unlisted pieces stay in base. */
  pieces?: Partial<Record<Color, Spot[]>>
  labourers?: GameState['labourers']
}

export function setup(opts: SetupOptions = {}): GameState {
  const state = createGame({
    players: opts.players ?? 4,
    rules: { backKick: false, lineKick: false, homeKick: false, labourer: false, ...opts.rules },
    endCondition: opts.endCondition ?? 'firstWins',
  })
  for (const [color, spots] of Object.entries(opts.pieces ?? {}) as [Color, Spot[]][]) {
    const player = state.players.find((p) => p.color === color)
    if (!player) throw new Error(`${color} is not seated`)
    spots.forEach((spot, i) => {
      player.pieces[i] = typeof spot === 'number' ? track(spot) : spot
    })
  }
  if (opts.turn) state.turn = opts.turn
  if (opts.roll !== undefined) state.pendingRoll = opts.roll
  if (opts.labourers) state.labourers = { ...opts.labourers }
  return state
}

export const piece = (color: Color, index = 0): PieceId => ({ color, index })
