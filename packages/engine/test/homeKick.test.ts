import { describe, expect, it } from 'vitest'
import { legalMoves } from '../src/legalMoves'
import { lane, track } from '../src/position'
import type { GameState } from '../src/types'
import { movePath } from '../src/movePath'
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
  const both = { homeKick: true, backKick: true }

  it('counting backwards through the entry, with Back Kick on', () => {
    // 27 → 26 → 25 → 24 (yellow's entry), then into lane 1 → 2.
    const s = setup({ rules: both, roll: 5, pieces: { red: [27], yellow: [lane('yellow', 2)] } })
    expect(homeKicks(s)).toEqual([
      { kind: 'homeKick', piece: piece('red'), to: lane('yellow', 2), kick: piece('yellow') },
    ])
  })

  it('not counting backwards with Back Kick off', () => {
    expect(homeKicks(setup({ rules, roll: 5, pieces: { red: [27], yellow: [lane('yellow', 2)] } }))).toEqual([])
  })

  it('a backward count is stopped by an opponent block on the way', () => {
    const s = setup({ rules: both, roll: 5, pieces: { red: [27], yellow: [lane('yellow', 2)], green: [25, 25] } })
    expect(homeKicks(s)).toEqual([])
  })

  it('counting back from the start side into your own lane kicks an invader there', () => {
    // 0 → 51 → 50 (red's entry), then into red's lane 1 → 2 → 3 → 4.
    const s = setup({ rules: both, roll: 6, pieces: { red: [0], blue: [lane('red', 4)] } })
    expect(homeKicks(s)).toEqual([{ kind: 'homeKick', piece: piece('red'), to: lane('red', 4), kick: piece('blue') }])
    expect(movePath(s, homeKicks(s)[0])).toEqual([track(51), track(50), lane('red', 1), lane('red', 2), lane('red', 3), lane('red', 4)])
  })

  it('not into your own lane with Back Kick off, past a block, or just to move', () => {
    expect(homeKicks(setup({ rules, roll: 6, pieces: { red: [0], blue: [lane('red', 4)] } }))).toEqual([])
    expect(homeKicks(setup({ rules: both, roll: 6, pieces: { red: [0], blue: [lane('red', 4)], green: [51, 51] } }))).toEqual([])
    expect(homeKicks(setup({ rules: both, roll: 6, pieces: { red: [0] } }))).toEqual([])
  })

  it('coming home forward is still a plain forward kick, not a second home kick', () => {
    const s = setup({ rules: both, roll: 4, pieces: { red: [50], blue: [lane('red', 4)] } })
    expect(homeKicks(s)).toEqual([])
    expect(legalMoves(s).filter((m) => m.kick)).toEqual([{ kind: 'forward', piece: piece('red'), to: lane('red', 4), kick: piece('blue') }])
  })

  it('a piece in your own lane does not count back out and in again', () => {
    const s = setup({ rules: both, roll: 4, pieces: { red: [lane('red', 1)], blue: [lane('red', 3)] } })
    expect(homeKicks(s)).toEqual([])
  })

  it('a piece in an opponent’s lane cannot turn back into it', () => {
    // Out of lane 1 to 24, then back in to lane 2: not allowed.
    const s = setup({ rules: both, roll: 3, pieces: { red: [lane('yellow', 1)], yellow: [lane('yellow', 2)] } })
    expect(homeKicks(s)).toEqual([])
  })
})
