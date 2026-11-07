import { describe, expect, it } from 'vitest'
import { applyMove, roll } from '../src/game'
import { legalMoves } from '../src/legalMoves'
import { HOME, lane, track } from '../src/position'
import { getPlayer } from '../src/state'
import type { GameState } from '../src/types'
import { piece, setup, type SetupOptions } from './helpers'

const rules = { labourer: true }
const playFirst = (s: GameState, value: number) => {
  const rolled = roll(s, value)
  return applyMove(rolled, legalMoves(rolled)[0])
}

describe('labourer', () => {
  it('kicking the victim’s last piece in play makes them your labourer', () => {
    const s = playFirst(setup({ rules, pieces: { red: [5], yellow: [8] } }), 3)
    expect(s.labourers).toEqual({ yellow: 'red' })
  })

  it('not while the victim has another piece in play', () => {
    const s = playFirst(setup({ rules, pieces: { red: [5], yellow: [8, 30] } }), 3)
    expect(s.labourers).toEqual({})
  })

  it('pieces already home do not count as in play', () => {
    const s = playFirst(setup({ rules, pieces: { red: [5], yellow: [8, HOME, HOME, HOME] } }), 3)
    expect(s.labourers).toEqual({ yellow: 'red' })
  })

  it('is off by default', () => {
    expect(playFirst(setup({ pieces: { red: [5], yellow: [8] } }), 3).labourers).toEqual({})
  })

  const owned: SetupOptions = { rules, turn: 'yellow', labourers: { yellow: 'red' } }

  it('the owner plays the victim’s roll under 6, then play passes after the victim', () => {
    const s = roll(setup({ ...owned, pieces: { red: [5] } }), 3)
    expect(legalMoves(s)).toEqual([{ kind: 'forward', piece: piece('red'), to: track(8) }])
    expect(applyMove(s, legalMoves(s)[0]).turn).toBe('blue')
  })

  it('the roll is wasted if the owner cannot move', () => {
    const s = roll(setup(owned), 3)
    expect(s.pendingRoll).toBeUndefined()
    expect(s.turn).toBe('blue')
  })

  it('a 6 ends it, and the victim plays the 6 and rolls again', () => {
    const s = roll(setup({ ...owned, pieces: { red: [5] } }), 6)
    expect(s.labourers).toEqual({})
    expect(legalMoves(s).every((m) => m.piece.color === 'yellow')).toBe(true)
    expect(applyMove(s, legalMoves(s)[0]).turn).toBe('yellow')
  })

  it('an owner can gain a second labourer with a victim’s roll', () => {
    const s = playFirst(setup({ ...owned, pieces: { red: [5], green: [8] } }), 3)
    expect(s.labourers).toEqual({ yellow: 'red', green: 'red' })
  })

  it('an owner can be labourered while still owning someone', () => {
    const s = playFirst(
      setup({ rules, turn: 'green', labourers: { yellow: 'red' }, pieces: { red: [10], green: [7] } }),
      3,
    )
    expect(s.labourers).toEqual({ yellow: 'red', red: 'green' })
  })

  it('finishing releases the owner’s labourers', () => {
    const s = playFirst(
      setup({ ...owned, endCondition: 'playForPlaces', pieces: { red: [lane('red', 4), HOME, HOME, HOME] } }),
      2,
    )
    expect(getPlayer(s, 'red').finishedPlace).toBe(1)
    expect(s.labourers).toEqual({})
    expect(s.turn).toBe('blue')
  })
})
