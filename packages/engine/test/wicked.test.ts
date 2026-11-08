import { describe, expect, it } from 'vitest'
import { describeMove, isWicked } from '../src/effects'
import { applyMove } from '../src/game'
import { legalMoves } from '../src/legalMoves'
import { movePath } from '../src/movePath'
import { lineMoves } from '../src/moves/line'
import { backwardPaths } from '../src/path'
import { lane, track } from '../src/position'
import type { GameState, Move } from '../src/types'
import { piece, setup } from './helpers'

const back = { backKick: true }
const both = { backKick: true, lineKick: true }
const red0 = piece('red')
const yellow0 = piece('yellow')
const kicks = (s: GameState, kind: Move['kind']) => legalMoves(s).filter((m) => m.kind === kind && m.kick)

describe('counting back out of your own lane turns either way at the tip', () => {
  it('back along the arm it came in on, or on round the far side past the entrance', () => {
    expect(backwardPaths('red', lane('red', 4), 6)).toEqual([
      [lane('red', 3), lane('red', 2), lane('red', 1), track(50), track(49), track(48)],
      [lane('red', 3), lane('red', 2), lane('red', 1), track(50), track(51), track(0)],
    ])
  })

  it('there is only one way while the count stays in the lane or stops on the tip', () => {
    expect(backwardPaths('red', lane('red', 4), 4)).toEqual([[lane('red', 3), lane('red', 2), lane('red', 1), track(50)]])
  })

  it('a piece on the track backs up as before', () => {
    expect(backwardPaths('red', track(49), 3)).toEqual([[track(48), track(47), track(46)]])
    expect(backwardPaths('red', track(1), 3)).toEqual([[track(0), track(51), track(50)]])
  })

  it('the far-side turn is still only a move when it kicks', () => {
    expect(legalMoves(setup({ rules: back, roll: 6, pieces: { red: [lane('red', 4)] } })).filter((m) => m.kind === 'back')).toEqual([])
  })
})

describe('wicked', () => {
  it('a back kick out of the lane, round past the entrance onto your start, is wicked', () => {
    const s = setup({ rules: back, roll: 6, pieces: { red: [lane('red', 4)], yellow: [0] } })
    const [move] = kicks(s, 'back')
    expect(move).toEqual({ kind: 'back', piece: red0, to: track(0), kick: yellow0 })
    expect(isWicked(s, move)).toBe(true)
  })

  it('a back kick out of the lane onto 51, just past the entrance, is wicked', () => {
    // lane 3 → 2 → 1 → 50 → 51
    const s = setup({ rules: back, roll: 4, pieces: { red: [lane('red', 3)], yellow: [51] } })
    const [move] = kicks(s, 'back')
    expect(move.to).toEqual(track(51))
    expect(isWicked(s, move)).toBe(true)
  })

  it('a back kick out of the lane back along the arm is a plain back kick', () => {
    const s = setup({ rules: back, roll: 6, pieces: { red: [lane('red', 4)], yellow: [48] } })
    const [move] = kicks(s, 'back')
    expect(move.to).toEqual(track(48))
    expect(isWicked(s, move)).toBe(false)
  })

  it('a line kick from the home approach across your own lane is wicked', () => {
    // 44 → 45 → 46, then across red lane 3 onto 2.
    const s = setup({ rules: { lineKick: true }, roll: 2, pieces: { red: [44], yellow: [2] } })
    const [move] = kicks(s, 'line')
    expect(move).toEqual({ kind: 'line', piece: red0, via: track(46), to: track(2), kick: yellow0 })
    expect(isWicked(s, move)).toBe(true)
  })

  it('a line kick across onto the home approach (the shortcut) is not wicked', () => {
    const s = setup({ rules: { lineKick: true }, roll: 2, pieces: { red: [0], yellow: [46] } })
    const [move] = kicks(s, 'line')
    expect(move).toEqual({ kind: 'line', piece: red0, via: track(2), to: track(46), kick: yellow0 })
    expect(isWicked(s, move)).toBe(false)
  })

  // Out of the lane, a line kick across it lands where the other way round would have: the same
  // outcome as a back kick, so the player is offered that one. The line kick still rates the same.
  it('a line kick after counting back out of the lane onto the arm is wicked', () => {
    // lane 1 → 50 → 49 → 48 → 47, then across red lane 2 onto 1.
    const s = setup({ rules: both, roll: 4, pieces: { red: [lane('red', 1)], yellow: [1] } })
    const [move] = lineMoves(s, red0, 4)
    expect(move).toMatchObject({ via: track(47), to: track(1) })
    expect(isWicked(s, move)).toBe(true)
    expect(kicks(s, 'back')).toEqual([{ kind: 'back', piece: red0, to: track(1), kick: yellow0 }])
    expect(isWicked(s, kicks(s, 'back')[0])).toBe(true)
  })

  it('a line kick after turning round the far side, back across onto the arm, is not wicked', () => {
    // lane 1 → 50 → 51 → 0 → 1, then across red lane 2 onto 47.
    const s = setup({ rules: both, roll: 4, pieces: { red: [lane('red', 1)], yellow: [47] } })
    const [move] = lineMoves(s, red0, 4)
    expect(move).toMatchObject({ via: track(1), to: track(47) })
    expect(isWicked(s, move)).toBe(false)
  })

  it('a back kick that stays inside your own lane is not wicked', () => {
    const s = setup({ rules: back, roll: 2, pieces: { red: [lane('red', 4)], yellow: [lane('red', 2)] } })
    expect(isWicked(s, kicks(s, 'back')[0])).toBe(false)
  })

  it('a back kick on the track is not wicked', () => {
    const s = setup({ rules: back, roll: 3, pieces: { red: [10], yellow: [7] } })
    expect(isWicked(s, kicks(s, 'back')[0])).toBe(false)
  })

  it('movePath walks out of the lane and round the far side', () => {
    const s = setup({ rules: back, roll: 6, pieces: { red: [lane('red', 4)], yellow: [0] } })
    expect(movePath(s, kicks(s, 'back')[0])).toEqual([lane('red', 3), lane('red', 2), lane('red', 1), track(50), track(51), track(0)])
  })

  it('movePath walks round the far side to a line kick’s via', () => {
    const s = setup({ rules: both, roll: 4, pieces: { red: [lane('red', 1)], yellow: [47] } })
    expect(movePath(s, lineMoves(s, red0, 4)[0])).toEqual([track(50), track(51), track(0), track(1), track(47)])
  })

  it('describeMove gives the back kick, then wicked on top', () => {
    const s = setup({ rules: back, roll: 6, pieces: { red: [lane('red', 4)], yellow: [0] } })
    const move = kicks(s, 'back')[0]
    expect(describeMove(s, move, applyMove(s, move))).toEqual([
      { type: 'kick', kind: 'back', at: track(0), from: track(51), kicker: red0, victim: yellow0 },
      { type: 'wicked', piece: red0, at: track(0) },
    ])
  })

  it('describeMove gives the line kick, then wicked on top', () => {
    const s = setup({ rules: { lineKick: true }, roll: 2, pieces: { red: [44], yellow: [2] } })
    const move = kicks(s, 'line')[0]
    expect(describeMove(s, move, applyMove(s, move)).map((e) => e.type)).toEqual(['kick', 'wicked'])
  })
})
