import { describe, expect, it } from 'vitest'
import { applyMove, roll } from '../src/game'
import { legalMoves } from '../src/legalMoves'
import { BASE, lane, track } from '../src/position'
import { getPlayer } from '../src/state'
import type { GameState } from '../src/types'
import { piece, setup } from './helpers'

const rules = { lineKick: true }
const lines = (s: GameState) => legalMoves(s).filter((m) => m.kind === 'line')

describe('line kick', () => {
  it('lands, then jumps across the lane onto the opponent', () => {
    const s = setup({ rules, roll: 2, pieces: { red: [5], yellow: [15] } })
    expect(lines(s)).toEqual([
      { kind: 'line', piece: piece('red'), via: track(7), to: track(15), kick: piece('yellow') },
    ])
    expect(legalMoves(s)).toContainEqual({ kind: 'forward', piece: piece('red'), to: track(7) })
  })

  it('the kicker takes the opponent’s square', () => {
    const s = roll(setup({ rules, pieces: { red: [5], yellow: [15] } }), 2)
    const after = applyMove(s, lines(s)[0])
    expect(getPlayer(after, 'red').pieces[0]).toEqual(track(15))
    expect(getPlayer(after, 'yellow').pieces[0]).toEqual(BASE)
  })

  it('works when landing on your own piece', () => {
    expect(lines(setup({ rules, roll: 2, pieces: { red: [5, 7], yellow: [15] } }))).toHaveLength(1)
  })

  it('is blocked by any piece on the lane square between', () => {
    const s = setup({ rules, roll: 2, pieces: { red: [5], yellow: [15], green: [lane('green', 3)] } })
    expect(lines(s)).toEqual([])
  })

  it('never happens on row 0', () => {
    expect(lines(setup({ rules, roll: 2, pieces: { red: [8], yellow: [12] } }))).toEqual([])
  })

  it('works across your own lane as a shortcut', () => {
    const s = setup({ rules, roll: 1, pieces: { red: [0], yellow: [47] } })
    expect(lines(s)).toEqual([
      { kind: 'line', piece: piece('red'), via: track(1), to: track(47), kick: piece('yellow') },
    ])
  })

  it('whoever lands can kick, so the opponent can do it to you', () => {
    const s = setup({ rules, turn: 'yellow', roll: 2, pieces: { yellow: [5], red: [15] } })
    expect(lines(s)).toEqual([
      { kind: 'line', piece: piece('yellow'), via: track(7), to: track(15), kick: piece('red') },
    ])
  })

  it('after a backward move only when Back Kick is also on', () => {
    const pieces = { red: [9], yellow: [15] }
    expect(lines(setup({ rules: { lineKick: true, backKick: true }, roll: 2, pieces }))).toEqual([
      { kind: 'line', piece: piece('red'), via: track(7), to: track(15), kick: piece('yellow') },
    ])
    expect(lines(setup({ rules, roll: 2, pieces }))).toEqual([])
  })

  it('not when the landing square holds an opponent (that is a front kick)', () => {
    const s = setup({ rules, roll: 2, pieces: { red: [5], yellow: [7, 15] } })
    expect(legalMoves(s)).toEqual([{ kind: 'forward', piece: piece('red'), to: track(7), kick: piece('yellow') }])
  })

  it('cannot kick a block', () => {
    expect(lines(setup({ rules, roll: 2, pieces: { red: [5], yellow: [15, 15] } }))).toEqual([])
  })

  it('is off by default', () => {
    expect(lines(setup({ roll: 2, pieces: { red: [5], yellow: [15] } }))).toEqual([])
  })

  it('merges with a straight move that has the same result', () => {
    // Forward 3 from 11 kicks on 14. Back 3 to 8, then across green lane 2, also kicks on 14.
    const s = setup({ rules: { lineKick: true, backKick: true }, roll: 3, pieces: { red: [11], yellow: [14] } })
    expect(legalMoves(s)).toEqual([{ kind: 'forward', piece: piece('red'), to: track(14), kick: piece('yellow') }])
  })
})
