import { describe, expect, it } from 'vitest'
import { applyMove, roll } from '../src/game'
import { legalMoves } from '../src/legalMoves'
import { HOME, lane } from '../src/position'
import { getPlayer } from '../src/state'
import { piece, setup } from './helpers'

const almostDone = { red: [lane('red', 4), HOME, HOME, HOME] }

describe('finishing', () => {
  it('reaching home needs an exact roll', () => {
    expect(legalMoves(setup({ roll: 3, pieces: almostDone }))).toEqual([])
    expect(legalMoves(setup({ roll: 2, pieces: almostDone }))).toEqual([
      { kind: 'forward', piece: piece('red'), to: HOME },
    ])
  })

  it('firstWins ends the game at the first finisher', () => {
    const s = roll(setup({ pieces: almostDone }), 2)
    const next = applyMove(s, legalMoves(s)[0])
    expect(next.status).toBe('finished')
    expect(getPlayer(next, 'red').finishedPlace).toBe(1)
    expect(getPlayer(next, 'green').finishedPlace).toBeUndefined()
    expect(() => roll(next, 3)).toThrow('game is over')
  })

  it('playForPlaces keeps going and skips the finished player, even with rolls left', () => {
    const s = roll(
      roll(setup({ players: 3, endCondition: 'playForPlaces', pieces: { red: [50, HOME, HOME, HOME] } }), 6),
      3,
    )
    const next = applyMove(s, legalMoves(s)[0])
    expect(next.status).toBe('playing')
    expect(getPlayer(next, 'red').finishedPlace).toBe(1)
    expect(next.turn).toBe('green')
    expect(next.queuedRolls).toEqual([])
  })

  it('playForPlaces ends when one player is left', () => {
    const s = roll(setup({ players: 2, endCondition: 'playForPlaces', pieces: almostDone }), 2)
    const next = applyMove(s, legalMoves(s)[0])
    expect(next.status).toBe('finished')
    expect(getPlayer(next, 'red').finishedPlace).toBe(1)
    expect(getPlayer(next, 'yellow').finishedPlace).toBe(2)
  })
})
