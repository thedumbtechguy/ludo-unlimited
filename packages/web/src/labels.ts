import type { Color, GameState, Move, PieceId, Position } from '@ludo/engine'

export const COLOR_NAME: Record<Color, string> = { red: 'Red', green: 'Green', yellow: 'Yellow', blue: 'Blue' }

/** A place on the board as a noun: "square 9", "Yellow's home lane, square 2". */
export function placeName(pos: Position): string {
  switch (pos.kind) {
    case 'base':
      return 'base'
    case 'home':
      return 'home'
    case 'track':
      return `square ${pos.index + 1}`
    case 'lane':
      return `${COLOR_NAME[pos.owner]}'s home lane, square ${pos.index}`
  }
}

export function describePosition(pos: Position): string {
  switch (pos.kind) {
    case 'base':
      return 'in base'
    case 'home':
      return 'home'
    case 'track':
      return `on ${placeName(pos)}`
    case 'lane':
      return `in ${placeName(pos)}`
  }
}

export const pieceLabel = (piece: PieceId, pos: Position): string =>
  `${COLOR_NAME[piece.color]} piece ${piece.index + 1}, ${describePosition(pos)}`

/** A movable piece by its on-board number rather than its index. */
export const numberedPieceLabel = (number: number, piece: PieceId, pos: Position): string =>
  `Piece ${number}: ${COLOR_NAME[piece.color]}, ${describePosition(pos)}`

/** "Kick Yellow" or "Move". */
export const targetAction = (move: Move): string => (move.kick ? `Kick ${COLOR_NAME[move.kick.color]}` : 'Move')

/** `rolls` is the sum spelled out ("6+4") for a combined move. */
export const targetLabel = (move: Move, rolls?: string): string =>
  `${targetAction(move)} ${describePosition(move.to)}${rolls ? ` using ${rolls}` : ''}`

export const numberedTargetLabel = (number: number, move: Move, rolls?: string): string =>
  `Piece ${number}: ${targetLabel(move, rolls)}`

/** "1", "1 and 2", "1, 2 and 3". */
export const listNumbers = (numbers: number[]): string =>
  numbers.length === 1 ? `${numbers[0]}` : `${numbers.slice(0, -1).join(', ')} and ${numbers.at(-1)}`

/** The rolls a combined move adds up, e.g. "6+4"; undefined for a single-roll move. */
export function combinedRolls(state: GameState, move: Move): string | undefined {
  const rolls = move.rolls ?? 1
  if (rolls < 2 || state.pendingRoll === undefined) return undefined
  return [state.pendingRoll, ...state.queuedRolls.slice(0, rolls - 1)].join('+')
}

const KICK_VERB: Record<Move['kind'], string> = {
  enter: 'kicked',
  forward: 'kicked',
  back: 'Back Kicked',
  line: 'Line Kicked',
  homeKick: 'Home Kicked',
}

export const kickMessage = (move: Move): string | undefined =>
  move.kick ? `${COLOR_NAME[move.piece.color]} ${KICK_VERB[move.kind]} ${COLOR_NAME[move.kick.color]}!` : undefined
