export const COLORS = ['red', 'green', 'yellow', 'blue'] as const
export type Color = (typeof COLORS)[number]

export type Position =
  | { kind: 'base' }
  | { kind: 'track'; index: number }
  | { kind: 'lane'; owner: Color; index: number }
  | { kind: 'home' }

export type PieceId = { color: Color; index: number }

export type Rules = {
  backKick: boolean
  lineKick: boolean
  homeKick: boolean
  labourer: boolean
}

export type EndCondition = 'firstWins' | 'playForPlaces'

export type Settings = {
  players: 2 | 3 | 4
  rules: Rules
  endCondition: EndCondition
}

export type Move =
  | { kind: 'enter'; piece: PieceId; to: Position; kick?: PieceId }
  | { kind: 'forward'; piece: PieceId; to: Position; kick?: PieceId }
  | { kind: 'back'; piece: PieceId; to: Position; kick: PieceId }
  | { kind: 'line'; piece: PieceId; via: Position; to: Position; kick: PieceId }
  | { kind: 'homeKick'; piece: PieceId; to: Position; kick: PieceId }

export type GameEvent =
  | { type: 'roll'; value: number }
  | { type: 'move'; move: Move }
  | { type: 'pass' }

export type PlayerState = {
  color: Color
  pieces: Position[]
  finishedPlace?: number
}

export type GameState = {
  settings: Settings
  players: PlayerState[]
  turn: Color
  pendingRoll?: number
  labourers: Partial<Record<Color, Color>> // victim → owner
  log: GameEvent[]
  status: 'playing' | 'finished'
}
