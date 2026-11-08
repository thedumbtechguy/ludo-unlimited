import { isWicked, MODES, type Color, type GameState, type ModeName, type Move, type PieceId, type Position, type Rules } from '@ludo/engine'
import type { Seats } from './types'

export const COLOR_NAME: Record<Color, string> = { red: 'Red', green: 'Green', yellow: 'Yellow', blue: 'Blue' }

export const ORDINAL = ['1st', '2nd', '3rd', '4th']

/** The first human seat in seat order: the one the game calls "You". */
export const firstHuman = (seats: Seats, colors: Color[]): Color | undefined => colors.find((c) => seats[c] === 'human')

/** "You" for the first human, "Player 2", "Player 3"… for the others, "Computer" for the rest. */
export function seatNames(seats: Seats, colors: Color[]): Partial<Record<Color, string>> {
  let humans = 0
  return Object.fromEntries(
    colors.map((color) => {
      if (seats[color] !== 'human') return [color, 'Computer']
      humans += 1
      return [color, humans === 1 ? 'You' : `Player ${humans}`]
    }),
  )
}

/** The tag on the active yard. */
export const turnTag = (color: Color, you?: Color): string => (color === you ? 'Your turn' : `${COLOR_NAME[color]}'s turn`)

/** A roll that had no legal move, and who rolled it. */
export type Wasted = { color: Color; value: number }

export const wastedText = ({ color, value }: Wasted, you?: Color): string =>
  color === you ? `No move with your ${value}` : `${COLOR_NAME[color]} had no move with a ${value}`

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

const sameRules = (a: Rules, b: Rules) => (Object.keys(a) as (keyof Rules)[]).every((key) => a[key] === b[key])

/** The preset these rules match, if any. */
export const modeOf = (rules: Rules): ModeName | undefined =>
  (Object.keys(MODES) as ModeName[]).find((mode) => sameRules(rules, MODES[mode].rules))

const MODE_RULES_NAME: Record<ModeName, string> = { ghana: 'Ghana rules', classic: 'Classic rules' }

/** "Ghana rules", "Classic rules" or "Custom rules". */
export const rulesName = (rules: Rules): string => {
  const mode = modeOf(rules)
  return mode ? MODE_RULES_NAME[mode] : 'Custom rules'
}

const KICK_TITLE: Record<Move['kind'], string> = {
  enter: 'Kick!',
  forward: 'Kick!',
  back: 'Back kick!',
  line: 'Line kick!',
  homeKick: 'Home kick!',
}

export type KickCalloutText = { title: string; line: string; wicked?: boolean }

/**
 * The big callouts for a kick, in the order they show, worked out from the state before the move:
 * the kick itself, then "Wicked!" on top when it was the wicked move.
 */
export function kickCallouts(move: Move, before: GameState): KickCalloutText[] {
  if (!move.kick) return []
  const line = `${COLOR_NAME[move.piece.color]} sent ${COLOR_NAME[move.kick.color]} back to base`
  const kick = { title: KICK_TITLE[move.kind], line }
  return isWicked(before, move) ? [kick, { title: 'Wicked!', line, wicked: true }] : [kick]
}
