import { describe, expect, it } from 'vitest'
import { applyMove, roll } from '../src/game'
import { legalMoves } from '../src/legalMoves'
import { lane, track } from '../src/position'
import { getPlayer } from '../src/state'
import { piece, setup } from './helpers'

const rules = { backKick: true }
const backs = (s: Parameters<typeof legalMoves>[0]) => legalMoves(s).filter((m) => m.kind === 'back')

describe('back kick', () => {
  it('moves backwards onto a lone opponent and kicks it', () => {
    const s = setup({ rules, roll: 3, pieces: { red: [10], yellow: [7] } })
    expect(backs(s)).toEqual([{ kind: 'back', piece: piece('red'), to: track(7), kick: piece('yellow') }])
  })

  it('never moves backwards just to reposition', () => {
    expect(backs(setup({ rules, roll: 3, pieces: { red: [10] } }))).toEqual([])
  })

  it('is off by default', () => {
    expect(backs(setup({ roll: 3, pieces: { red: [10], yellow: [7] } }))).toEqual([])
  })

  it('can go back past your own start onto your lane entry, then turn into your lane', () => {
    const s = roll(setup({ rules, pieces: { red: [1], yellow: [50] } }), 3)
    const after = applyMove(s, backs(s)[0])
    expect(getPlayer(after, 'red').pieces[0]).toEqual(track(50))

    const nextTurn = setup({ rules, roll: 1, pieces: { red: [50] } })
    expect(legalMoves(nextTurn)).toContainEqual({ kind: 'forward', piece: piece('red'), to: lane('red', 1) })
  })

  it('a piece that just entered can back kick', () => {
    const s = setup({ rules, roll: 3, pieces: { red: [0], yellow: [49] } })
    expect(backs(s)).toHaveLength(1)
  })

  it('pieces in their own home lane cannot move backwards', () => {
    expect(backs(setup({ rules, roll: 3, pieces: { red: [lane('red', 2)], yellow: [50] } }))).toEqual([])
  })

  it('cannot pass an opponent block backwards', () => {
    const s = setup({ rules, roll: 4, pieces: { red: [10], yellow: [8, 8, 6] } })
    expect(backs(s)).toEqual([])
  })

  it('cannot kick a block', () => {
    expect(backs(setup({ rules, roll: 3, pieces: { red: [10], yellow: [7, 7] } }))).toEqual([])
  })
})
