import { describe, expect, it } from 'vitest'
import { applyMove, roll } from '../src/game'
import { legalMoves } from '../src/legalMoves'
import { movePath } from '../src/movePath'
import { BASE, HOME, track } from '../src/position'
import { getPlayer } from '../src/state'
import type { GameState } from '../src/types'
import { piece, setup } from './helpers'

const rollAll = (state: GameState, values: number[]) => values.reduce(roll, state)
const combined = (state: GameState) => legalMoves(state).filter((m) => m.rolls !== undefined)
const combinedKick = (state: GameState) => combined(state).find((m) => m.kick)!
const lone = (spot: number) => [spot, HOME, HOME, HOME]

describe('combining rolls', () => {
  // Red on 20 rolls 6 then 4; blue sits alone 10 behind.
  const userCase = () => rollAll(setup({ rules: { backKick: true }, pieces: { red: [20], blue: [10] } }), [6, 4])

  it('offers the single-roll moves, two-roll forward moves and a two-roll back kick', () => {
    const s = userCase()
    expect(s.pendingRoll).toBe(6)
    expect(s.queuedRolls).toEqual([4])
    expect(legalMoves(s)).toEqual([
      { kind: 'forward', piece: piece('red'), to: track(26) },
      { kind: 'enter', piece: piece('red', 1), to: track(0) },
      { kind: 'forward', piece: piece('red'), to: track(30), rolls: 2 },
      { kind: 'back', piece: piece('red'), to: track(10), kick: piece('blue'), rolls: 2 },
      { kind: 'forward', piece: piece('red', 1), to: track(4), rolls: 2 },
    ])
  })

  it('playing the combined kick uses both rolls and passes the turn', () => {
    const s = userCase()
    const next = applyMove(s, combinedKick(s))
    expect(getPlayer(next, 'red').pieces[0]).toEqual(track(10))
    expect(getPlayer(next, 'blue').pieces[0]).toEqual(BASE)
    expect(next.pendingRoll).toBeUndefined()
    expect(next.queuedRolls).toEqual([])
    expect(next.turn).toBe('green')
    expect(next.log.at(-1)).toEqual({ type: 'move', move: combinedKick(s) })
  })

  it('applies the legal move’s roll count even when the client leaves it out', () => {
    const s = userCase()
    const { rolls: _, ...bare } = combinedKick(s)
    expect(applyMove(s, bare).turn).toBe('green')
  })

  it('walks every square of a combined move', () => {
    const s = userCase()
    expect(movePath(s, combinedKick(s))).toEqual([19, 18, 17, 16, 15, 14, 13, 12, 11, 10].map(track))
  })

  it('combines into a forward kick landing exactly on an opponent', () => {
    const s = rollAll(setup({ pieces: { red: lone(5), yellow: [13] } }), [6, 2])
    expect(combined(s)).toEqual([{ kind: 'forward', piece: piece('red'), to: track(13), kick: piece('yellow'), rolls: 2 }])
  })

  it('combines forward without a kick, but never backward without one', () => {
    const s = rollAll(setup({ rules: { backKick: true }, pieces: { red: lone(5) } }), [6, 2])
    expect(combined(s)).toEqual([{ kind: 'forward', piece: piece('red'), to: track(13), rolls: 2 }])
  })

  it('a block on the path stops a combined move', () => {
    const s = rollAll(setup({ pieces: { red: lone(5), yellow: [13], green: [12, 12] } }), [6, 2])
    expect(combined(s)).toEqual([])
  })

  it('a single-roll move with the same result wins over the combined one', () => {
    // A 6 from 1 reaches 7, whose line hops across to 15; 6 + 6 + 2 walks forward onto 15 too.
    const s = rollAll(setup({ rules: { lineKick: true }, pieces: { red: [1], yellow: [15] } }), [6, 6, 2])
    const kicks = legalMoves(s).filter((m) => m.kick)
    expect(kicks).toEqual([{ kind: 'line', piece: piece('red'), via: track(7), to: track(15), kick: piece('yellow') }])
  })

  it('combines three rolls', () => {
    const s = rollAll(setup({ pieces: { red: lone(5), yellow: [20] } }), [6, 6, 3])
    const [twoRolls, move] = combined(s)
    expect(twoRolls).toEqual({ kind: 'forward', piece: piece('red'), to: track(17), rolls: 2 })
    expect(move).toEqual({ kind: 'forward', piece: piece('red'), to: track(20), kick: piece('yellow'), rolls: 3 })
    expect(movePath(s, move)).toHaveLength(15)
    const next = applyMove(s, move)
    expect(getPlayer(next, 'yellow').pieces[0]).toEqual(BASE)
    expect(next.queuedRolls).toEqual([])
    expect(next.pendingRoll).toBeUndefined()
    expect(next.turn).toBe('green')
  })

  it('a two-roll prefix leaves the rest of the queue to play', () => {
    const s = rollAll(setup({ pieces: { red: [5, 30, HOME, HOME], yellow: [17] } }), [6, 6, 3])
    const next = applyMove(s, combined(s)[0])
    expect(getPlayer(next, 'red').pieces[0]).toEqual(track(17))
    expect(next.pendingRoll).toBe(3)
    expect(next.queuedRolls).toEqual([])
    expect(next.turn).toBe('red')
  })
})

describe('entering and using the next rolls in one move', () => {
  // Red, all in base, rolls 6 then 3; blue sits alone on 45, across red's lane 2 from track 3.
  const userCase = () => rollAll(setup({ rules: { lineKick: true }, pieces: { blue: [45] } }), [6, 3])
  const lineKick = { kind: 'line', piece: piece('red'), via: track(3), to: track(45), kick: piece('blue'), rolls: 2 }

  it('enters and line kicks with the next roll', () => {
    expect(legalMoves(userCase())).toContainEqual(lineKick)
  })

  it('playing it puts the piece across, kicks, and uses both rolls', () => {
    const s = userCase()
    const next = applyMove(s, combinedKick(s))
    expect(getPlayer(next, 'red').pieces[0]).toEqual(track(45))
    expect(getPlayer(next, 'blue').pieces[0]).toEqual(BASE)
    expect(next.pendingRoll).toBeUndefined()
    expect(next.queuedRolls).toEqual([])
    expect(next.turn).toBe('green')
  })

  it('from base it still makes a Labourer and earns the bonus roll', () => {
    const s = rollAll(setup({ rules: { lineKick: true, labourer: true }, afterKick: 'bonusRoll', pieces: { blue: [45] } }), [6, 3])
    const next = applyMove(s, combinedKick(s))
    expect(next.labourers).toEqual({ blue: 'red' })
    expect(next.turn).toBe('red')
    expect(next.pendingRoll).toBeUndefined()
  })

  it('walks from the start square, then hops across', () => {
    const s = userCase()
    expect(movePath(s, combinedKick(s))).toEqual([0, 1, 2, 3, 45].map(track))
  })

  it('enters and front kicks with the next roll', () => {
    const s = rollAll(setup({ pieces: { yellow: [2] } }), [6, 2])
    expect(combined(s)).toEqual([{ kind: 'forward', piece: piece('red'), to: track(2), kick: piece('yellow'), rolls: 2 }])
    expect(movePath(s, combined(s)[0])).toEqual([0, 1, 2].map(track))
  })

  it('enters and moves on forward with the next roll, kick or not', () => {
    const s = rollAll(setup({ rules: { lineKick: true, backKick: true } }), [6, 3])
    expect(combined(s)).toEqual([{ kind: 'forward', piece: piece('red'), to: track(3), rolls: 2 }])
  })

  it('an opponent block on the start square stops it', () => {
    const s = rollAll(setup({ rules: { lineKick: true }, pieces: { blue: [0, 0, 45] } }), [6, 3])
    expect(combined(s)).toEqual([])
  })

  it('an enter that kicks on the start square does not combine further', () => {
    // Red's piece on 20 is there to play the 3 after the kick.
    const s = rollAll(setup({ rules: { lineKick: true }, pieces: { red: [20], blue: [0, 45] } }), [6, 3])
    expect(combined(s).filter((m) => m.piece.index === 1)).toEqual([])
    expect(legalMoves(s)).toContainEqual({ kind: 'enter', piece: piece('red', 1), to: track(0), kick: piece('blue') })
  })
})
