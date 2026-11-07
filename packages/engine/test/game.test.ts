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

  it('a wasted 6 still rolls again', () => {
    const s = roll(setup({ pieces: { red: [lane('red', 3), HOME, HOME, HOME] } }), 6)
    expect(s.pendingRoll).toBeUndefined()
    expect(s.turn).toBe('red')
  })

  it('applyMove moves the piece and passes the turn', () => {
    const s = roll(setup({ pieces: { red: [5] } }), 3)
    const next = applyMove(s, legalMoves(s)[0])
    expect(getPlayer(next, 'red').pieces[0]).toEqual(track(8))
    expect(next.turn).toBe('green')
    expect(next.pendingRoll).toBeUndefined()
  })

  it('a 6 gives another roll', () => {
    const s = roll(setup({ pieces: { red: [5] } }), 6)
    const move = legalMoves(s).find((m) => m.kind === 'forward')!
    expect(applyMove(s, move).turn).toBe('red')
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

  it('pass drops the pending roll and moves on, even after a 6', () => {
    const s = pass(roll(setup({ pieces: { red: [5] } }), 6))
    expect(s.pendingRoll).toBeUndefined()
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
    const s = roll(setup({ pieces: { yellow: [0] } }), 6)
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

