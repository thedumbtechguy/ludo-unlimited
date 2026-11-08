import { describe, expect, it } from 'vitest'
import { legalMoves } from '../src/legalMoves'
import { movePath } from '../src/movePath'
import { lane, track } from '../src/position'
import type { GameState, Move } from '../src/types'
import { setup } from './helpers'

const find = (s: GameState, kind: Move['kind']) => legalMoves(s).find((m) => m.kind === kind)!

describe('movePath', () => {
  it('walks a forward move square by square', () => {
    const s = setup({ roll: 3, pieces: { red: [5] } })
    expect(movePath(s, find(s, 'forward'))).toEqual([track(6), track(7), track(8)])
  })

  it('enters straight onto the start square', () => {
    const s = setup({ roll: 6 })
    expect(movePath(s, find(s, 'enter'))).toEqual([track(0)])
  })

  it('walks backwards for a back kick', () => {
    const s = setup({ rules: { backKick: true }, roll: 3, pieces: { red: [10], yellow: [7] } })
    expect(movePath(s, find(s, 'back'))).toEqual([track(9), track(8), track(7)])
  })

  it('lands on the via square, then hops across for a line kick', () => {
    const s = setup({ rules: { lineKick: true }, roll: 2, pieces: { red: [5], yellow: [15] } })
    expect(movePath(s, find(s, 'line'))).toEqual([track(6), track(7), track(15)])
  })

  it('hops from the start square for a line kick on entering', () => {
    const s = setup({ rules: { lineKick: true }, roll: 6, pieces: { yellow: [48] } })
    expect(movePath(s, find(s, 'line'))).toEqual([track(0), track(48)])
  })

  it('turns into the lane for a home kick', () => {
    const s = setup({ rules: { homeKick: true }, roll: 4, pieces: { red: [22], yellow: [lane('yellow', 2)] } })
    expect(movePath(s, find(s, 'homeKick'))).toEqual([track(23), track(24), lane('yellow', 1), lane('yellow', 2)])
  })
})
