import { describe, expect, it } from 'vitest'
import { legalMoves } from '../src/legalMoves'
import { track } from '../src/position'
import { piece, setup } from './helpers'

describe('front kick (always on)', () => {
  it('a forward move landing on a lone opponent kicks it', () => {
    const s = setup({ roll: 3, pieces: { red: [5], yellow: [8] } })
    expect(legalMoves(s)).toEqual([{ kind: 'forward', piece: piece('red'), to: track(8), kick: piece('yellow') }])
  })

  it('the player may still choose a different, non-kicking move', () => {
    const s = setup({ roll: 3, pieces: { red: [5, 20], yellow: [8] } })
    expect(legalMoves(s)).toContainEqual({ kind: 'forward', piece: piece('red', 1), to: track(23) })
  })

  it('entering kicks a lone opponent on the start square', () => {
    const s = setup({ roll: 6, pieces: { yellow: [0] } })
    expect(legalMoves(s)).toContainEqual({ kind: 'enter', piece: piece('red'), to: track(0), kick: piece('yellow') })
  })

  it('only a 6 enters', () => {
    expect(legalMoves(setup({ roll: 5 }))).toEqual([])
  })

  it('landing on your own piece is allowed', () => {
    const s = setup({ roll: 2, pieces: { red: [5, 7] } })
    expect(legalMoves(s)).toContainEqual({ kind: 'forward', piece: piece('red'), to: track(7) })
  })

  it('nothing is legal without a pending roll', () => {
    expect(legalMoves(setup({ pieces: { red: [5] } }))).toEqual([])
  })
})
