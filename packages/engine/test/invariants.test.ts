import { describe, expect, it } from 'vitest'
import { legalMoves } from '../src/legalMoves'
import { hasPiecesInPlay, isOpponentBlock, piecesAt } from '../src/occupancy'
import { isOnBoard, posKey } from '../src/position'
import { positionOf } from '../src/state'
import type { Color, GameState } from '../src/types'
import { playRandom, randomSettings, rng } from './random'

function checkInvariants(state: GameState): void {
  const colorsAt = new Map<string, Set<Color>>()
  for (const player of state.players) {
    expect(player.pieces).toHaveLength(4)
    for (const pos of player.pieces.filter(isOnBoard)) {
      const key = posKey(pos)
      colorsAt.set(key, (colorsAt.get(key) ?? new Set()).add(player.color))
    }
  }
  for (const colors of colorsAt.values()) expect(colors.size).toBe(1)

  for (const move of legalMoves(state)) {
    expect(isOpponentBlock(state, move.to, move.piece.color)).toBe(false)
    // A piece that kicked this turn sits out the rest of it.
    expect(state.kickers.some((k) => k.color === move.piece.color && k.index === move.piece.index)).toBe(false)
    if (move.kick) expect(piecesAt(state, positionOf(state, move.kick))).toHaveLength(1)
  }

  if (state.status === 'playing' && state.pendingRoll === undefined) {
    if (state.settings.afterKick === 'endsTurn') expect(state.queuedRolls).toEqual([])
    else expect(state.queuedRolls.every((r) => r === 6)).toBe(true)
  }
  if (state.pendingRoll !== undefined) expect(legalMoves(state).length).toBeGreaterThan(0)
  if (state.settings.afterKick === 'endsTurn') expect(state.queuedRolls).toEqual([])
  if (state.status === 'finished') expect(state.queuedRolls).toEqual([])

  for (const [victim, owner] of Object.entries(state.labourers) as [Color, Color][]) {
    expect(victim).not.toBe(owner)
    expect(hasPiecesInPlay(state, victim)).toBe(false)
  }
}

describe('random games', () => {
  it.each(Array.from({ length: 100 }, (_, i) => i + 1))(
    'seed %i keeps the invariants and finishes',
    (seed) => {
      let last: GameState | undefined
      for (const state of playRandom(randomSettings(rng(seed)), seed)) {
        checkInvariants(state)
        last = state
      }
      expect(last?.status).toBe('finished')
    },
    30_000,
  )
})
