import { describe, expect, it } from 'vitest'
import { applyMove, replay, roll, stopRolling } from '../src/game'
import { legalMoves } from '../src/legalMoves'
import { HOME, lane, track } from '../src/position'
import { getPlayer } from '../src/state'
import type { GameState } from '../src/types'
import { setup } from './helpers'

const playFirst = (state: GameState) => applyMove(state, legalMoves(state)[0])
const lone = (spot: number) => [spot, HOME, HOME, HOME]

describe('stopping early after a 6', () => {
  it('plays the rolls so far, then passes the turn', () => {
    const stopped = stopRolling(roll(setup({ pieces: { red: lone(5) } }), 6))
    expect(stopped.log.at(-1)).toEqual({ type: 'stop' })
    expect(stopped.pendingRoll).toBe(6)
    expect(stopped.queuedRolls).toEqual([])
    expect(() => roll(stopped, 3)).toThrow('roll already pending')
    const next = playFirst(stopped)
    expect(getPlayer(next, 'red').pieces[0]).toEqual(track(11))
    expect(next.turn).toBe('green')
  })

  it('plays every queued 6 in order', () => {
    const stopped = stopRolling(roll(roll(setup({ pieces: { red: lone(5) } }), 6), 6))
    expect(stopped.pendingRoll).toBe(6)
    expect(stopped.queuedRolls).toEqual([6])
    const next = playFirst(playFirst(stopped))
    expect(getPlayer(next, 'red').pieces[0]).toEqual(track(17))
    expect(next.turn).toBe('green')
  })

  it('an unplayable 6 leaves nothing to stop: the turn has already passed', () => {
    const rolled = roll(setup({ pieces: { red: [lane('red', 3), HOME, HOME, HOME] } }), 6)
    expect(rolled.turn).toBe('green')
    expect(() => stopRolling(rolled)).toThrow('not rolling')
  })

  it('a kick still earns the bonus roll', () => {
    const stopped = stopRolling(roll(setup({ afterKick: 'bonusRoll', pieces: { red: lone(5), yellow: [11] } }), 6))
    const next = playFirst(stopped)
    expect(next.turn).toBe('red')
    expect(next.pendingRoll).toBeUndefined()
  })

  it('throws outside the rolling phase', () => {
    const start = setup({ pieces: { red: lone(5) } })
    expect(() => stopRolling(start)).toThrow('not rolling')
    expect(() => stopRolling(roll(start, 3))).toThrow('not rolling')
    expect(() => stopRolling(setup({ roll: 6 }))).toThrow('not rolling')
  })

  it('throws in endsTurn mode', () => {
    const s = setup({ afterKick: 'endsTurn', pieces: { red: lone(5) } })
    s.queuedRolls = [6]
    expect(() => stopRolling(s)).toThrow('not rolling')
  })

  it('throws once the game is over', () => {
    const s = setup({ pieces: { red: lone(5) } })
    s.status = 'finished'
    s.queuedRolls = [6]
    expect(() => stopRolling(s)).toThrow('game is over')
  })

  it('replay rebuilds a game with a stop', () => {
    const settings = setup().settings
    const s = playFirst(stopRolling(roll(setup(), 6)))
    expect(replay(settings, s.log)).toEqual(s)
  })
})
