import { describe, expect, it } from 'vitest'
import { legalMoves } from '../src/legalMoves'
import { track } from '../src/position'
import { piece, setup } from './helpers'

describe('blocks', () => {
  it('cannot pass an opponent block', () => {
    expect(legalMoves(setup({ roll: 4, pieces: { red: [5], yellow: [7, 7] } }))).toEqual([])
  })

  it('cannot land on an opponent block', () => {
    expect(legalMoves(setup({ roll: 2, pieces: { red: [5], yellow: [7, 7] } }))).toEqual([])
  })

  it('cannot enter onto an opponent block', () => {
    expect(legalMoves(setup({ roll: 6, pieces: { yellow: [0, 0] } }))).toEqual([])
  })

  it('can pass your own block', () => {
    const s = setup({ roll: 4, pieces: { red: [5, 7, 7] } })
    expect(legalMoves(s)).toContainEqual({ kind: 'forward', piece: piece('red'), to: track(9) })
  })
})
