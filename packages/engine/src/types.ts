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

export type AfterKick = 'endsTurn' | 'normal' | 'bonusRoll'

export type Settings = {
  players: 2 | 3 | 4
  rules: Rules
  endCondition: EndCondition
  afterKick: AfterKick
}

/**
 * `rolls` is how many rolls the move uses: the pending roll plus the next `rolls - 1` queued ones,
 * added together. Only kicks combine rolls. Absent means 1.
 */
export type Move =
  | { kind: 'enter'; piece: PieceId; to: Position; kick?: PieceId; rolls?: number }
  | { kind: 'forward'; piece: PieceId; to: Position; kick?: PieceId; rolls?: number }
  | { kind: 'back'; piece: PieceId; to: Position; kick: PieceId; rolls?: number }
  | { kind: 'line'; piece: PieceId; via: Position; to: Position; kick: PieceId; rolls?: number }
  | { kind: 'homeKick'; piece: PieceId; to: Position; kick: PieceId; rolls?: number }

export type GameEvent =
  | { type: 'roll'; value: number }
  | { type: 'move'; move: Move }
  | { type: 'pass' }
  | { type: 'stop' }

export type PlayerState = {
  color: Color
  pieces: Position[]
  finishedPlace?: number
}

export type GameState = {
  settings: Settings
  players: PlayerState[]
  turn: Color
  /** The roll being played now. */
  pendingRoll?: number
  /** While rolling (no pendingRoll): every roll so far. While playing: the rolls after pendingRoll. */
  queuedRolls: number[]
  /** The turn player kicked during this turn; feeds `afterKick: 'bonusRoll'`. */
  kickedThisTurn: boolean
  labourers: Partial<Record<Color, Color>> // victim → owner
  log: GameEvent[]
  status: 'playing' | 'finished'
}
