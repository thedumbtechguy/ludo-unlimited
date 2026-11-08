import { describe, expect, it } from 'vitest'
import { applyMove, pass, roll } from '../src/game'
import { legalMoves } from '../src/legalMoves'
import { BASE, HOME, lane, track } from '../src/position'
import { getPlayer } from '../src/state'
import { piece, setup } from './helpers'

describe('turn flow', () => {
  it('roll records the value and waits for a move', () => {
    const s = roll(setup({ pieces: { red: [5] } }), 3)
    expect(s.pendingRoll).toBe(3)
    expect(s.turn).toBe('red')
    expect(s.log).toEqual([{ type: 'roll', value: 3 }])
  })

  it('rejects a second roll before moving', () => {
    const s = roll(setup({ pieces: { red: [5] } }), 3)
    expect(() => roll(s, 2)).toThrow('roll already pending')
  })

  it('rejects values outside 1–6', () => {
    expect(() => roll(setup(), 7)).toThrow('invalid roll')
    expect(() => roll(setup(), 0)).toThrow('invalid roll')
  })

  it('wastes a roll with no legal move and passes the turn', () => {
    const s = roll(setup(), 3)
    expect(s.pendingRoll).toBeUndefined()
    expect(s.turn).toBe('green')
  })

  it('a 6 that cannot be played earns no further roll: it is lost and the turn passes', () => {
    // Red's last piece needs exactly 3 to get home, so a 6 has nowhere to go.
    const s = roll(setup({ pieces: { red: [lane('red', 3), HOME, HOME, HOME] } }), 6)
    expect(s.pendingRoll).toBeUndefined()
    expect(s.queuedRolls).toEqual([])
    expect(s.turn).toBe('green')
  })

  it('a 6 that can be played lets you roll again', () => {
    const s = roll(setup({ pieces: { red: [5] } }), 6)
    expect(s.pendingRoll).toBeUndefined()
    expect(s.queuedRolls).toEqual([6])
    expect(s.turn).toBe('red')
  })

  it('applyMove moves the piece and passes the turn', () => {
    const s = roll(setup({ pieces: { red: [5] } }), 3)
    const next = applyMove(s, legalMoves(s)[0])
    expect(getPlayer(next, 'red').pieces[0]).toEqual(track(8))
    expect(next.turn).toBe('green')
    expect(next.pendingRoll).toBeUndefined()
  })

  it('a 6 lets you roll again before moving', () => {
    const s = roll(setup({ pieces: { red: [5] } }), 6)
    expect(s.turn).toBe('red')
    expect(s.pendingRoll).toBeUndefined()
    expect(legalMoves(s)).toEqual([])
    expect(roll(s, 3).pendingRoll).toBe(6)
  })

  it('a kick sends the opponent to base', () => {
    const s = roll(setup({ pieces: { red: [5], yellow: [8] } }), 3)
    expect(getPlayer(applyMove(s, legalMoves(s)[0]), 'yellow').pieces[0]).toEqual(BASE)
  })

  it('rejects an illegal move', () => {
    const s = roll(setup({ pieces: { red: [5] } }), 3)
    expect(() => applyMove(s, { kind: 'forward', piece: piece('red'), to: track(9) })).toThrow('illegal move')
  })

  it('never changes its input', () => {
    const s = roll(setup({ pieces: { red: [5], yellow: [8] } }), 3)
    const before = structuredClone(s)
    applyMove(s, legalMoves(s)[0])
    expect(s).toEqual(before)
  })

  it('pass drops the pending and queued rolls and moves on, even after a 6', () => {
    const s = pass(roll(roll(setup({ pieces: { red: [5] } }), 6), 3))
    expect(s.pendingRoll).toBeUndefined()
    expect(s.queuedRolls).toEqual([])
    expect(s.turn).toBe('green')
    expect(s.log.at(-1)).toEqual({ type: 'pass' })
  })

  it('turn order only includes seated colours', () => {
    expect(roll(setup({ players: 2 }), 3).turn).toBe('yellow')
  })

  it('rejects a fractional roll', () => {
    expect(() => roll(setup(), 3.5)).toThrow('invalid roll')
  })

  it('an enter that kicks sends the opponent to base', () => {
    const s = roll(roll(setup({ pieces: { red: [BASE, 20], yellow: [0] } }), 6), 3)
    const next = applyMove(s, legalMoves(s).find((m) => m.kind === 'enter')!)
    expect(getPlayer(next, 'red').pieces[0]).toEqual(track(0))
    expect(getPlayer(next, 'yellow').pieces[0]).toEqual(BASE)
  })

  it('turn order and pass skip players who have finished', () => {
    const s = setup({ endCondition: 'playForPlaces', pieces: { red: [5] } })
    s.players.find((p) => p.color === 'green')!.finishedPlace = 1
    expect(roll(s, 3).turn).toBe('red')
    expect(applyMove(roll(s, 3), { kind: 'forward', piece: piece('red'), to: track(8) }).turn).toBe('yellow')
    expect(pass(s).turn).toBe('yellow')
  })

  it('nothing can happen once the game is over', () => {
    const s = roll(setup({ pieces: { red: [lane('red', 4), HOME, HOME, HOME] } }), 2)
    const over = applyMove(s, legalMoves(s)[0])
    expect(() => pass(over)).toThrow('game is over')
    expect(() => applyMove(over, legalMoves(s)[0])).toThrow('game is over')
  })
})


describe('after a kick', () => {
  /**
   * Red on 5 kicks yellow on 5 + value; outside endsTurn mode a 6 is followed by a 1, which red's
   * other piece on 30 plays after the kick.
   */
  const kickOn = (afterKick: 'endsTurn' | 'normal' | 'bonusRoll', value: number) => {
    let s = roll(setup({ afterKick, pieces: { red: [5, 30, HOME, HOME], yellow: [5 + value] } }), value)
    if (value === 6 && afterKick !== 'endsTurn') s = roll(s, 1)
    s = applyMove(s, legalMoves(s).find((m) => m.kick)!)
    while (s.pendingRoll !== undefined) s = applyMove(s, legalMoves(s)[0])
    return s.turn
  }

  it('endsTurn: a kick passes play on, even on a 6', () => {
    expect(kickOn('endsTurn', 6)).toBe('green')
    expect(kickOn('endsTurn', 3)).toBe('green')
  })

  it('normal: a kick changes nothing', () => {
    expect(kickOn('normal', 6)).toBe('green')
    expect(kickOn('normal', 3)).toBe('green')
  })

  it('normal: a kick on a 6 still lets the rolls after it be played', () => {
    const s = roll(roll(setup({ pieces: { red: [5, 30, HOME, HOME], yellow: [11] } }), 6), 1)
    const next = applyMove(s, legalMoves(s).find((m) => m.kick)!)
    expect(next.turn).toBe('red')
    expect(next.pendingRoll).toBe(1)
  })

  it('bonusRoll: a kick earns another roll', () => {
    expect(kickOn('bonusRoll', 6)).toBe('red')
    expect(kickOn('bonusRoll', 3)).toBe('red')
  })

  it('bonusRoll: a labourer owner kicking with the victim’s roll earns nothing', () => {
    const s = roll(
      setup({
        afterKick: 'bonusRoll',
        rules: { labourer: true },
        turn: 'yellow',
        labourers: { yellow: 'red' },
        pieces: { red: [5], green: [8] },
      }),
      3,
    )
    const move = legalMoves(s).find((m) => m.kick)!
    expect(move.piece).toEqual(piece('red'))
    expect(applyMove(s, move).turn).toBe('blue')
  })
})
