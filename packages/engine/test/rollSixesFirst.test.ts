import { describe, expect, it } from 'vitest'
import { applyMove, roll } from '../src/game'
import { currentMover, legalMoves } from '../src/legalMoves'
import { HOME, lane, track } from '../src/position'
import { getPlayer } from '../src/state'
import type { GameState } from '../src/types'
import { piece, setup } from './helpers'

const rollAll = (state: GameState, values: number[]) => values.reduce(roll, state)
const playFirst = (state: GameState) => applyMove(state, legalMoves(state)[0])
const lone = (spot: number | ReturnType<typeof lane>) => [spot, HOME, HOME, HOME]

describe('roll your sixes first', () => {
  it('keeps rolling on 6s, then plays the rolls in the order rolled', () => {
    const start = setup({ pieces: { red: lone(5) } })
    const rolling = rollAll(start, [6, 6])
    expect(rolling.pendingRoll).toBeUndefined()
    expect(rolling.queuedRolls).toEqual([6, 6])
    expect(rolling.turn).toBe('red')

    const playing = roll(rolling, 3)
    expect(playing.pendingRoll).toBe(6)
    expect(playing.queuedRolls).toEqual([6, 3])
    expect(() => roll(playing, 4)).toThrow('roll already pending')

    const first = playFirst(playing)
    expect(getPlayer(first, 'red').pieces[0]).toEqual(track(11))
    expect(first.pendingRoll).toBe(6)
    expect(first.queuedRolls).toEqual([3])
    expect(first.turn).toBe('red')

    const second = playFirst(first)
    expect(getPlayer(second, 'red').pieces[0]).toEqual(track(17))
    expect(second.pendingRoll).toBe(3)
    expect(second.queuedRolls).toEqual([])

    const third = playFirst(second)
    expect(getPlayer(third, 'red').pieces[0]).toEqual(track(20))
    expect(third.pendingRoll).toBeUndefined()
    expect(third.queuedRolls).toEqual([])
    expect(third.turn).toBe('green')
  })

  it('each roll is its own move, or rolls add up for a forward move', () => {
    const s = rollAll(setup({ pieces: { red: lone(5) } }), [6, 3])
    expect(legalMoves(s)).toEqual([
      { kind: 'forward', piece: piece('red'), to: track(11) },
      { kind: 'forward', piece: piece('red'), to: track(14), rolls: 2 },
    ])
  })

  it('skips a roll with no legal move when its turn comes', () => {
    // 45 + 6 is the first lane square; a second 6 would overshoot home, a 1 does not.
    const s = rollAll(setup({ pieces: { red: lone(45) } }), [6, 6, 1])
    const afterFirst = playFirst(s)
    expect(getPlayer(afterFirst, 'red').pieces[0]).toEqual(lane('red', 1))
    expect(afterFirst.pendingRoll).toBe(1)
    expect(afterFirst.queuedRolls).toEqual([])
    const done = playFirst(afterFirst)
    expect(getPlayer(done, 'red').pieces[0]).toEqual(lane('red', 2))
    expect(done.turn).toBe('green')
  })

  it('an unplayable 6 ends the rolling, so there is no next roll', () => {
    const s = roll(setup({ pieces: { red: lone(lane('red', 3)) } }), 6)
    expect(s.pendingRoll).toBeUndefined()
    expect(s.queuedRolls).toEqual([])
    expect(s.turn).toBe('green')
  })

  it('a roll with no legal move passes play on', () => {
    const s = roll(setup({ pieces: { red: lone(lane('red', 3)) } }), 4)
    expect(s.pendingRoll).toBeUndefined()
    expect(s.queuedRolls).toEqual([])
    expect(s.turn).toBe('green')
  })

  it('finishing drops the remaining rolls and passes play on', () => {
    const s = rollAll(setup({ players: 3, endCondition: 'playForPlaces', pieces: { red: lone(50) } }), [6, 6, 3])
    const next = playFirst(s)
    expect(getPlayer(next, 'red').finishedPlace).toBe(1)
    expect(next.pendingRoll).toBeUndefined()
    expect(next.queuedRolls).toEqual([])
    expect(next.turn).toBe('green')
  })

  it('firstWins: finishing ends the game and drops the remaining rolls', () => {
    const next = playFirst(rollAll(setup({ pieces: { red: lone(50) } }), [6, 3]))
    expect(next.status).toBe('finished')
    expect(next.pendingRoll).toBeUndefined()
    expect(next.queuedRolls).toEqual([])
  })
})

describe('endsTurn mode: one roll at a time', () => {
  const afterKick = 'endsTurn'

  it('a 6 is playable straight away, then rolls again', () => {
    const s = roll(setup({ afterKick, pieces: { red: lone(5) } }), 6)
    expect(s.pendingRoll).toBe(6)
    expect(s.queuedRolls).toEqual([])
    const next = playFirst(s)
    expect(next.turn).toBe('red')
    expect(next.pendingRoll).toBeUndefined()
    expect(next.queuedRolls).toEqual([])
  })

  it('a 6 that cannot be played earns no further roll', () => {
    const s = roll(setup({ afterKick, pieces: { red: lone(lane('red', 3)) } }), 6)
    expect(s.pendingRoll).toBeUndefined()
    expect(s.queuedRolls).toEqual([])
    expect(s.turn).toBe('green')
  })

  it('a kick on a 6 ends the turn', () => {
    const s = roll(setup({ afterKick, pieces: { red: lone(5), yellow: [11] } }), 6)
    expect(applyMove(s, legalMoves(s).find((m) => m.kick)!).turn).toBe('green')
  })

  it('any other roll passes play on', () => {
    expect(playFirst(roll(setup({ afterKick, pieces: { red: lone(5) } }), 3)).turn).toBe('green')
  })
})

describe('bonusRoll with a batch', () => {
  const kickThenPlay = (afterKick: 'normal' | 'bonusRoll') => {
    const s = rollAll(setup({ afterKick, pieces: { red: lone(5), yellow: [11] } }), [6, 3])
    const kicked = applyMove(s, legalMoves(s).find((m) => m.kick)!)
    expect(kicked.pendingRoll).toBe(3)
    expect(kicked.turn).toBe('red')
    return playFirst(kicked)
  }

  it('a kick in the batch earns a new rolling phase once the queue is empty', () => {
    const next = kickThenPlay('bonusRoll')
    expect(next.turn).toBe('red')
    expect(next.pendingRoll).toBeUndefined()
    expect(next.queuedRolls).toEqual([])
    expect(next.kickedThisTurn).toBe(false)
    // The bonus roll is an ordinary roll: no kick this time, so play passes on.
    expect(playFirst(roll(next, 3)).turn).toBe('green')
  })

  it('normal: the same kick earns nothing extra', () => {
    expect(kickThenPlay('normal').turn).toBe('green')
  })

  it('a kick with a wasted batch roll still earns the bonus', () => {
    // After the kick, red sits on 11: green's block on 14 stops the second 6, so it's skipped.
    const s = rollAll(setup({ afterKick: 'bonusRoll', pieces: { red: lone(5), yellow: [11], green: [14, 14] } }), [6, 6, 1])
    const kicked = applyMove(s, legalMoves(s).find((m) => m.kick)!)
    expect(getPlayer(kicked, 'yellow').pieces[0]).toEqual({ kind: 'base' })
    expect(kicked.pendingRoll).toBe(1)
    const next = playFirst(kicked)
    expect(next.turn).toBe('red')
    expect(next.pendingRoll).toBeUndefined()
  })
})

describe('labourer with a batch', () => {
  const owned = { rules: { labourer: true }, turn: 'yellow' as const, labourers: { yellow: 'red' as const } }

  it('a victim’s 6 frees them and they keep rolling', () => {
    const s = roll(setup({ ...owned, pieces: { red: [5] } }), 6)
    expect(s.labourers).toEqual({})
    expect(s.pendingRoll).toBeUndefined()
    expect(s.queuedRolls).toEqual([6])
    expect(s.turn).toBe('yellow')
  })

  it('a victim’s single roll under 6 is played by the owner, then play passes after the victim', () => {
    const s = roll(setup({ ...owned, pieces: { red: [5] } }), 3)
    expect(currentMover(s)).toBe('red')
    expect(legalMoves(s)).toEqual([{ kind: 'forward', piece: piece('red'), to: track(8) }])
    const next = playFirst(s)
    expect(next.turn).toBe('blue')
    expect(next.queuedRolls).toEqual([])
  })
})
