import { applyMove } from './game'
import { currentMover, legalMoves } from './legalMoves'
import { piecesAt } from './occupancy'
import { isOnBoard, posKey } from './position'
import { progress } from './progress'
import { getPlayer } from './state'
import type { Color, GameState, Move, Position } from './types'

export const LEVELS = ['easy', 'normal', 'hard', 'expert'] as const
export type Level = (typeof LEVELS)[number]

/** How often Easy and Normal play any legal move instead of Hard's choice. */
const SLIPS: Record<'easy' | 'normal', number> = { easy: 0.8, normal: 0.4 }

/**
 * The computer's move, or undefined with no legal move. `random` (0 ≤ r < 1) breaks ties.
 * - easy, normal: Hard's move, except now and then (see `SLIPS`) any legal move.
 * - hard: finish > kick > enter > furthest along.
 * - expert: plans the rest of its rolls, then weighs progress, kicks and how exposed its pieces are.
 */
export function chooseMove(state: GameState, random: () => number, level: Level = 'hard'): Move | undefined {
  const moves = legalMoves(state)
  if (moves.length === 0) return undefined
  switch (level) {
    case 'easy':
    case 'normal':
      return random() < SLIPS[level] ? pick(moves, random) : sensible(moves, random)
    case 'hard':
      return sensible(moves, random)
    case 'expert':
      return planned(state, moves, random)
  }
}

const pick = <T>(items: T[], random: () => number): T => items[Math.floor(random() * items.length)]

/** Higher is better: finish > kick > enter > furthest destination. */
function quickScore(move: Move): number {
  if (move.to.kind === 'home') return 3000
  if (move.kick) return 2000
  if (move.kind === 'enter') return 1000
  return progress(move.piece.color, move.to)
}

function sensible(moves: Move[], random: () => number): Move {
  const best = Math.max(...moves.map(quickScore))
  return pick(
    moves.filter((m) => quickScore(m) === best),
    random,
  )
}

/** Moves within this much of the best count as equally good. */
const TIE = 1e-6
/** How many positions Expert looks at per move before it stops planning ahead, so a move stays quick. */
const BUDGET = 60

type Search = { me: Color; memo: Map<string, number>; left: number }

function planned(state: GameState, moves: Move[], random: () => number): Move {
  const search: Search = { me: currentMover(state)!, memo: new Map(), left: BUDGET }
  const scores = moves.map((move) => bestFrom(applyMove(state, move), search))
  const best = Math.max(...scores)
  return pick(
    moves.filter((_, i) => scores[i] >= best - TIE),
    random,
  )
}

/** The value of `state` for `me`, playing on through any rolls of mine still to play this turn. */
function bestFrom(state: GameState, search: Search): number {
  const key = stateKey(state)
  const known = search.memo.get(key)
  if (known !== undefined) return known
  search.left -= 1
  const next = search.left > 0 && state.status === 'playing' && currentMover(state) === search.me ? legalMoves(state) : []
  const value = next.length > 0 ? Math.max(...next.map((move) => bestFrom(applyMove(state, move), search))) : evaluate(state, search.me)
  search.memo.set(key, value)
  return value
}

const stateKey = (state: GameState): string =>
  [
    state.turn,
    state.pendingRoll ?? '-',
    state.queuedRolls.join(''),
    state.kickers.map((k) => `${k.color}${k.index}`).join(','),
    JSON.stringify(state.labourers),
    ...state.players.map((p) => `${p.finishedPlace ?? ''}:${p.pieces.map(posKey).join(',')}`),
  ].join('|')

/** Weights for `evaluate`. */
const W = {
  /** Getting out of base: a kicked piece needs a 6 to come back. */
  out: 40,
  /** Getting home, on top of the squares travelled. */
  home: 24,
  /** Squares count more the further along a piece is, so it pushes pieces home rather than spreading out. */
  convex: 1,
  /** Opponents' progress against our own: kicking the leader matters, but so does going forward. */
  opponents: 0.6,
  /** A piece at risk: the chance it's kicked before our next turn, times what it's worth. */
  danger: 1,
  /** Being made someone's Labourer is worse than losing the piece. */
  labourerRisk: 40,
  /** Each opponent working for us, and the cost of working for someone. */
  owning: 25,
  /** Rolling again straight away. */
  extraRoll: 12,
}

/** What a piece is worth to its owner. */
function pieceValue(color: Color, pos: Position): number {
  if (pos.kind === 'base') return 0
  const p = pos.kind === 'home' ? 56 + W.home : progress(color, pos)
  return W.out + p + (W.convex * p * p) / 56
}

const playerValue = (state: GameState, color: Color): number =>
  getPlayer(state, color).pieces.reduce((sum, pos) => sum + pieceValue(color, pos), 0)

/** How good `state` is for `me` once its turn is over (or it waits to roll again). */
function evaluate(state: GameState, me: Color): number {
  const mine = getPlayer(state, me)
  if (mine.finishedPlace !== undefined) return 10_000 - mine.finishedPlace * 1000
  if (state.status !== 'playing') return -10_000

  const others = state.players.filter((p) => p.color !== me && p.finishedPlace === undefined)
  const theirs = others.map((p) => playerValue(state, p.color))
  // Mostly the leader, a little everyone else.
  const rivals = theirs.length === 0 ? 0 : 0.6 * Math.max(...theirs) + (0.4 * theirs.reduce((a, b) => a + b, 0)) / theirs.length

  let value = playerValue(state, me) - W.opponents * rivals
  const owned = Object.values(state.labourers).filter((owner) => owner === me).length
  value += W.owning * owned
  if (state.labourers[me]) value -= W.owning
  if (state.turn === me && state.pendingRoll === undefined) value += W.extraRoll
  value -= W.danger * risk(state, me, others.map((p) => p.color))
  return value
}

/**
 * The expected loss from opponents' next rolls: for each of my lone pieces, the chance some opponent
 * can kick it with a single roll, times what it's worth. Counts every kind of kick the rules allow.
 */
function risk(state: GameState, me: Color, opponents: Color[]): number {
  const pieces = getPlayer(state, me).pieces
  const exposed = pieces.map((pos, index) => ({ pos, index })).filter(({ pos }) => isOnBoard(pos) && piecesAt(state, pos).length === 1)
  if (exposed.length === 0) return 0
  const safe = new Map(exposed.map(({ index }) => [index, 1]))
  for (const color of opponents) {
    const hits = new Map<number, number>()
    for (let roll = 1; roll <= 6; roll++) {
      const theirTurn: GameState = { ...state, turn: color, pendingRoll: roll, queuedRolls: [], kickers: [], labourers: {} }
      const kicked = new Set(
        legalMoves(theirTurn)
          .filter((m) => m.kick?.color === me)
          .map((m) => m.kick!.index),
      )
      for (const index of kicked) hits.set(index, (hits.get(index) ?? 0) + 1)
    }
    for (const [index, count] of hits) safe.set(index, safe.get(index)! * (1 - count / 6))
  }
  const inPlay = pieces.filter(isOnBoard).length
  let loss = 0
  for (const { pos, index } of exposed) {
    const chance = 1 - safe.get(index)!
    loss += chance * pieceValue(me, pos)
    if (inPlay === 1 && state.settings.rules.labourer) loss += chance * W.labourerRisk
  }
  return loss
}
