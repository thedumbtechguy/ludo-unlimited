import { describe, expect, it } from 'vitest'
import { chooseMove } from '../src/bot'
import { applyMove, roll } from '../src/game'
import { legalMoves } from '../src/legalMoves'
import { HOME, lane, track } from '../src/position'
import { progress } from '../src/progress'
import { createGame } from '../src/state'
import type { GameState } from '../src/types'
import { piece, setup } from './helpers'
import { randomSettings, rng } from './random'

const first = () => 0

describe('progress', () => {
  it('counts along the route from the start square', () => {
    expect(progress('red', track(0))).toBe(0)
    expect(progress('red', track(50))).toBe(50)
    expect(progress('red', lane('red', 3))).toBe(53)
    expect(progress('red', HOME)).toBe(56)
    expect(progress('green', track(13))).toBe(0)
  })

  it('treats the square behind your start as the very beginning', () => {
    expect(progress('red', track(51))).toBe(-1)
  })

  it('measures an opponent lane by the way back out', () => {
    expect(progress('red', lane('yellow', 2))).toBe(22)
  })
})

describe('chooseMove', () => {
  it('returns undefined with no legal move', () => {
    expect(chooseMove(setup({ roll: 3 }), first)).toBeUndefined()
  })

  it('finishing beats kicking', () => {
    const s = setup({ roll: 2, pieces: { red: [lane('red', 4), 20], yellow: [22] } })
    expect(chooseMove(s, first)?.to).toEqual(HOME)
  })

  it('kicking beats entering', () => {
    const s = setup({ roll: 6, pieces: { red: [5], yellow: [11] } })
    expect(chooseMove(s, first)?.kick).toEqual(piece('yellow'))
  })

  it('entering beats a plain move', () => {
    expect(chooseMove(setup({ roll: 6, pieces: { red: [5] } }), first)?.kind).toBe('enter')
  })

  it('otherwise moves the piece that ends furthest along', () => {
    expect(chooseMove(setup({ roll: 3, pieces: { red: [5, 30] } }), first)?.piece).toEqual(piece('red', 1))
  })

  it('breaks ties with the random source', () => {
    const s = setup({ roll: 3, pieces: { red: [5, 20], yellow: [8, 23] } })
    expect(chooseMove(s, () => 0)?.piece).toEqual(piece('red', 0))
    expect(chooseMove(s, () => 0.99)?.piece).toEqual(piece('red', 1))
  })

  it('only picks legal moves, and bot-only games finish', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const next = rng(seed)
      let state: GameState = createGame(randomSettings(rng(seed + 1000)))
      for (let step = 0; step < 100_000 && state.status === 'playing'; step++) {
        if (state.pendingRoll === undefined) {
          state = roll(state, 1 + Math.floor(next() * 6))
          continue
        }
        const move = chooseMove(state, next)!
        expect(legalMoves(state)).toContainEqual(move)
        state = applyMove(state, move)
      }
      expect(state.status).toBe('finished')
    }
  }, 60_000)
})
