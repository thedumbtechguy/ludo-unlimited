import { BASE } from './position'
import { COLORS, type Color, type GameState, type PieceId, type PlayerState, type Position, type Settings } from './types'

export const SEATS: Record<Settings['players'], Color[]> = {
  2: ['red', 'yellow'],
  3: ['red', 'green', 'yellow'],
  4: [...COLORS],
}

export function createGame(settings: Settings): GameState {
  return {
    settings,
    players: SEATS[settings.players].map((color) => ({ color, pieces: [BASE, BASE, BASE, BASE] })),
    turn: SEATS[settings.players][0],
    queuedRolls: [],
    kickedThisTurn: false,
    kickers: [],
    labourers: {},
    log: [],
    status: 'playing',
  }
}

export function getPlayer(state: GameState, color: Color): PlayerState {
  const player = state.players.find((p) => p.color === color)
  if (!player) throw new Error(`${color} is not playing`)
  return player
}

export const positionOf = (state: GameState, piece: PieceId): Position =>
  getPlayer(state, piece.color).pieces[piece.index]

/** Deep copy, except the append-only log, whose events are never mutated. */
export function cloneState(state: GameState): GameState {
  return { ...structuredClone({ ...state, log: [] }), log: state.log.slice() }
}
