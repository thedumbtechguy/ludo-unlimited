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

  it('walks back out of your own lane onto the track for a wicked back kick', () => {
    const s = setup({ rules: { backKick: true }, roll: 5, pieces: { red: [lane('red', 4)], yellow: [49] } })
    expect(movePath(s, find(s, 'back'))).toEqual([lane('red', 3), lane('red', 2), lane('red', 1), track(50), track(49)])
  })

  it('hops across for a line kick reached by moving backward', () => {
    const s = setup({ rules: { lineKick: true, backKick: true }, roll: 2, pieces: { red: [9], yellow: [15] } })
    expect(movePath(s, find(s, 'line'))).toEqual([track(8), track(7), track(15)])
  })

  it('walks backward into the victim’s lane for a backward home kick', () => {
    const s = setup({ rules: { homeKick: true, backKick: true }, roll: 5, pieces: { red: [27], yellow: [lane('yellow', 2)] } })
    expect(movePath(s, find(s, 'homeKick'))).toEqual([track(26), track(25), track(24), lane('yellow', 1), lane('yellow', 2)])
  })

  it('turns into the lane straight from the entry square for a home kick', () => {
    const s = setup({ rules: { homeKick: true }, roll: 3, pieces: { red: [24], yellow: [lane('yellow', 3)] } })
    expect(movePath(s, find(s, 'homeKick'))).toEqual([lane('yellow', 1), lane('yellow', 2), lane('yellow', 3)])
  })
})
