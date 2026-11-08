import { applyMove, roll } from '../src/game'
import { legalMoves } from '../src/legalMoves'
import { createGame } from '../src/state'
import type { GameState, Settings } from '../src/types'

/** mulberry32: small, fast, seeded. */
export function rng(seed: number): () => number {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function randomSettings(next: () => number): Settings {
  return {
    players: ([2, 3, 4] as const)[Math.floor(next() * 3)],
    rules: { backKick: next() < 0.5, lineKick: next() < 0.5, homeKick: next() < 0.5, labourer: next() < 0.5 },
    endCondition: next() < 0.5 ? 'firstWins' : 'playForPlaces',
    afterKick: (['endsTurn', 'normal', 'bonusRoll'] as const)[Math.floor(next() * 3)],
  }
}

export function* playRandom(settings: Settings, seed: number, maxSteps = 200_000): Generator<GameState> {
  const next = rng(seed)
  let state = createGame(settings)
  for (let step = 0; step < maxSteps && state.status === 'playing'; step++) {
    if (state.pendingRoll === undefined) {
      state = roll(state, 1 + Math.floor(next() * 6))
    } else {
      const moves = legalMoves(state)
      state = applyMove(state, moves[Math.floor(next() * moves.length)])
    }
    yield state
  }
}
