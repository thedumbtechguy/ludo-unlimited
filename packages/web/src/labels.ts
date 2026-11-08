import { isWicked, MODES, type Color, type GameEffect, type GameState, type ModeName, type Move, type PieceId, type Position, type Rules, type TurnTimer } from '@ludo/engine'
import { FINISH_CALLOUT_MS, WIN_CALLOUT_MS } from './fx/actions'
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

/** The turn label: "Your turn", or the player's name (online) or colour. */
export const turnTag = (color: Color, you?: Color, names?: Partial<Record<Color, string>>): string =>
  color === you ? 'Your turn' : `${names?.[color] ?? COLOR_NAME[color]}'s turn`

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

/** The turn timer choices, each with what it means. */
export const TIMERS = [
  ['relaxed', 'Relaxed', '60 seconds for each roll or move.'],
  ['normal', 'Normal', '30 seconds for each roll or move.'],
  ['quick', 'Quick', '15 seconds for each roll or move.'],
  ['off', 'No timer', 'Take as long as you like. The computer only steps in if someone leaves.'],
] as const satisfies readonly (readonly [TurnTimer, string, string])[]

export const timerName = (timer: TurnTimer): string => TIMERS.find(([t]) => t === timer)![1]

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

/** `ms`: how long it stays up, if not the usual. `win`: the biggest text, for the winner. */
export type KickCalloutText = { title: string; line: string; wicked?: boolean; win?: boolean; ms?: number }

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

/**
 * The callout when a move gets a player's last piece home: "Red wins!" for 1st place, "Green comes
 * 2nd!" after that, and underneath what happens next. `effects` are the move's, `after` the game
 * once it's made, `you` the first human seat (named "You").
 */
export function finishCallout(effects: GameEffect[], after: GameState, you?: Color): (KickCalloutText & { color: Color }) | undefined {
  const finished = effects.flatMap((e) => (e.type === 'playerFinished' ? [e] : []))
  if (finished.length === 0) return undefined
  // When play for places ends, the one player left is placed last along with the finisher.
  const [{ color, place }, last] = finished
  const who = (c: Color) => (c === you ? 'You' : COLOR_NAME[c])
  const comes = (c: Color) => (c === you ? 'come' : 'comes')
  const title = place === 1 ? `${who(color)} ${color === you ? 'win' : 'wins'}!` : `${who(color)} ${comes(color)} ${ORDINAL[place - 1]}!`
  const line =
    after.status === 'playing'
      ? `Play goes on for ${ORDINAL[place]} place`
      : last
        ? `${who(last.color)} ${comes(last.color)} ${ORDINAL[last.place - 1]}`
        : 'All four pieces home'
  const win = place === 1
  return { title, line, color, win, ms: win ? WIN_CALLOUT_MS : FINISH_CALLOUT_MS }
}
