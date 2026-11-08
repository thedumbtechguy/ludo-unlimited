import { describe, expect, it } from 'vitest'
import { applyMove, roll } from '../src/game'
import { legalMoves } from '../src/legalMoves'
import { HOME, track } from '../src/position'
import { getPlayer } from '../src/state'
import type { GameState } from '../src/types'
import { piece, setup } from './helpers'

const rollAll = (state: GameState, values: number[]) => values.reduce(roll, state)
const kicks = (state: GameState) => legalMoves(state).filter((m) => m.kick)

describe('a piece that kicks sits out the rest of the turn', () => {
  it('with one piece, a 6 + 1 cannot kick with the 6: the 1 would have nothing to move', () => {
    const s = rollAll(setup({ pieces: { red: [5, HOME, HOME, HOME], yellow: [11] } }), [6, 1])
    expect(kicks(s).filter((m) => m.rolls === undefined)).toEqual([])
  })

  it('with a second piece, the kick is allowed and the other piece plays the 1', () => {
    const s = rollAll(setup({ pieces: { red: [5, 30, HOME, HOME], yellow: [11] } }), [6, 1])
    const kicked = applyMove(s, { kind: 'forward', piece: piece('red'), to: track(11), kick: piece('yellow') })
    expect(kicked.pendingRoll).toBe(1)
    expect(legalMoves(kicked)).toEqual([{ kind: 'forward', piece: piece('red', 1), to: track(31) }])
  })

  it('the kick is refused even when every other choice wastes the 1 too', () => {
    // Red on 20 can back kick blue on 14 with the 6, or go to 26, where green's block on 27 stops the 1.
    const s = rollAll(
      setup({ rules: { backKick: true }, pieces: { red: [20, HOME, HOME, HOME], blue: [14], green: [27, 27] } }),
      [6, 1],
    )
    expect(legalMoves(s)).toEqual([{ kind: 'forward', piece: piece('red'), to: track(26) }])
  })

  it('a combined kick that uses every roll is fine', () => {
    const s = rollAll(setup({ pieces: { red: [5, HOME, HOME, HOME], yellow: [12] } }), [6, 1])
    expect(kicks(s)).toEqual([{ kind: 'forward', piece: piece('red'), to: track(12), kick: piece('yellow'), rolls: 2 }])
  })

  it('a kick with the last roll is always fine', () => {
    const s = roll(setup({ pieces: { red: [5, HOME, HOME, HOME], yellow: [8] } }), 3)
    expect(kicks(s)).toHaveLength(1)
  })

  it('a 6 can still bring a new piece out to play the rolls after a kick', () => {
    // The first 6 kicks yellow, the second enters a piece from base and the 1 moves it on.
    const s = rollAll(setup({ pieces: { red: [5], yellow: [11] } }), [6, 6, 1])
    const kicked = applyMove(s, { kind: 'forward', piece: piece('red'), to: track(11), kick: piece('yellow') })
    expect(legalMoves(kicked).every((m) => m.piece.index !== 0)).toBe(true)
  })

  it('the kicker can move again on a bonus roll', () => {
    const s = roll(setup({ afterKick: 'bonusRoll', pieces: { red: [5, HOME, HOME, HOME], yellow: [8] } }), 3)
    const bonus = roll(applyMove(s, kicks(s)[0]), 2)
    expect(bonus.turn).toBe('red')
    expect(legalMoves(bonus)).toEqual([{ kind: 'forward', piece: piece('red'), to: track(10) }])
  })

  it('the kicker is free again on the next turn', () => {
    const s = roll(setup({ pieces: { red: [5, HOME, HOME, HOME], yellow: [8] } }), 3)
    const next = applyMove(s, kicks(s)[0])
    expect(next.kickers).toEqual([])
    expect(getPlayer(next, 'red').pieces[0]).toEqual(track(8))
  })
})
