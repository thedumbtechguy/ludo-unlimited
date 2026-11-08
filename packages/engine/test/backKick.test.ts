import { describe, expect, it } from 'vitest'
import { applyMove, roll } from '../src/game'
import { legalMoves } from '../src/legalMoves'
import { lineMoves } from '../src/moves/line'
import { lane, track } from '../src/position'
import { getPlayer } from '../src/state'
import { piece, setup } from './helpers'

const rules = { backKick: true }
const both = { backKick: true, lineKick: true }
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

  it('counts backwards out of your own lane to kick', () => {
    // lane 4 → 3 → 2 → 1 → 50 → 49
    const s = setup({ rules, roll: 5, pieces: { red: [lane('red', 4)], yellow: [49] } })
    expect(backs(s)).toEqual([{ kind: 'back', piece: piece('red'), to: track(49), kick: piece('yellow') }])
  })

  // (The player is offered the back kick round the far side instead: it has the same outcome.)
  it('counting back out of your own lane can line kick from an empty landing square', () => {
    // lane 1 → 50 → 49 → 48 → 47, then across red lane 2 onto 1.
    const s = setup({ rules: both, roll: 4, pieces: { red: [lane('red', 1)], yellow: [1] } })
    expect(lineMoves(s, piece('red'), 4)).toEqual([
      { kind: 'line', piece: piece('red'), via: track(47), to: track(1), kick: piece('yellow') },
    ])
  })

  it('the lane square a count out of the lane just left does not block its line kick', () => {
    // lane 2 → 1 → 50 → 49 → 48 → 47, then across red lane 2 (now empty) onto 1.
    const s = setup({ rules: both, roll: 5, pieces: { red: [lane('red', 2)], yellow: [1] } })
    expect(lineMoves(s, piece('red'), 5)).toEqual([
      { kind: 'line', piece: piece('red'), via: track(47), to: track(1), kick: piece('yellow') },
    ])
  })

  it('a piece in an opponent’s lane cannot move backwards', () => {
    const s = setup({ rules, roll: 1, pieces: { red: [lane('yellow', 2)], yellow: [lane('yellow', 3)] } })
    expect(backs(s)).toEqual([])
  })

  it('cannot pass an opponent block backwards', () => {
    const s = setup({ rules, roll: 4, pieces: { red: [10], yellow: [8, 8, 6] } })
    expect(backs(s)).toEqual([])
  })

  it('cannot kick a block', () => {
    expect(backs(setup({ rules, roll: 3, pieces: { red: [10], yellow: [7, 7] } }))).toEqual([])
  })
})
