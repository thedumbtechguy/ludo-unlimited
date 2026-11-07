import { describe, expect, it } from 'vitest'
import { legalMoves } from '../src/legalMoves'
import { lane, track } from '../src/position'
import type { GameState } from '../src/types'
import { piece, setup } from './helpers'

const rules = { homeKick: true }
const homeKicks = (s: GameState) => legalMoves(s).filter((m) => m.kind === 'homeKick')

describe('home kick', () => {
  it('turns into the opponent’s lane to kick on an exact count', () => {
    const s = setup({ rules, roll: 4, pieces: { red: [22], yellow: [lane('yellow', 2)] } })
    expect(homeKicks(s)).toEqual([
      { kind: 'homeKick', piece: piece('red'), to: lane('yellow', 2), kick: piece('yellow') },
    ])
    expect(legalMoves(s)).toContainEqual({ kind: 'forward', piece: piece('red'), to: track(26) })
  })

  it('needs an exact count', () => {
    expect(homeKicks(setup({ rules, roll: 4, pieces: { red: [22], yellow: [lane('yellow', 3)] } }))).toEqual([])
  })

  it('works from the opponent’s entry square', () => {
    expect(homeKicks(setup({ rules, roll: 3, pieces: { red: [24], yellow: [lane('yellow', 3)] } }))).toHaveLength(1)
  })

  it('the invader leaves by moving back out to the track', () => {
    const s = setup({ rules, roll: 4, pieces: { red: [lane('yellow', 2)] } })
    expect(legalMoves(s)).toEqual([{ kind: 'forward', piece: piece('red'), to: track(26) }])
  })

  it('the invader can kick on its way out', () => {
    const s = setup({ rules, roll: 3, pieces: { red: [lane('yellow', 2)], yellow: [25] } })
    expect(legalMoves(s)).toEqual([{ kind: 'forward', piece: piece('red'), to: track(25), kick: piece('yellow') }])
  })

  it('the lane owner can kick the invader', () => {
    const s = setup({ rules, turn: 'yellow', roll: 2, pieces: { yellow: [24], red: [lane('yellow', 2)] } })
    expect(legalMoves(s)).toContainEqual({
      kind: 'forward',
      piece: piece('yellow'),
      to: lane('yellow', 2),
      kick: piece('red'),
    })
  })

  it('is stopped by an opponent block on the way', () => {
    const s = setup({ rules, roll: 4, pieces: { red: [22], yellow: [lane('yellow', 2), 23, 23] } })
    expect(homeKicks(s)).toEqual([])
  })

  it('is off by default', () => {
    expect(homeKicks(setup({ roll: 4, pieces: { red: [22], yellow: [lane('yellow', 2)] } }))).toEqual([])
  })
})
