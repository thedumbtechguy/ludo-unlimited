import { describe, expect, it } from 'vitest'
import { describeMove, describeRoll, type GameEffect } from '../src/effects'
import { applyMove, roll, stopRolling } from '../src/game'
import { legalMoves } from '../src/legalMoves'
import { HOME, lane, track } from '../src/position'
import type { GameState, Move } from '../src/types'
import { piece, setup, type SetupOptions } from './helpers'

const lone = (spot: number | ReturnType<typeof lane>) => [spot, HOME, HOME, HOME]

/** Every roll in turn, collecting the effects each one describes. */
function rollAll(state: GameState, values: number[]): { state: GameState; effects: GameEffect[][] } {
  const effects: GameEffect[][] = []
  for (const value of values) {
    const next = roll(state, value)
    effects.push(describeRoll(state, next))
    state = next
  }
  return { state, effects }
}

function play(state: GameState, move: Move = legalMoves(state)[0]): { state: GameState; effects: GameEffect[] } {
  const next = applyMove(state, move)
  return { state: next, effects: describeMove(state, move, next) }
}

const only = (moves: Move[], kind: Move['kind']) => moves.find((m) => m.kind === kind && m.kick)!

describe('describeRoll', () => {
  it('a 6 starts a streak of 1, and each further 6 counts up', () => {
    const { effects } = rollAll(setup({ pieces: { red: lone(5) } }), [6, 6, 6, 6])
    expect(effects).toEqual([1, 2, 3, 4].map((count) => [{ type: 'sixStreak', color: 'red', count }]))
  })

  it('a roll under 6 with no streak says nothing', () => {
    expect(rollAll(setup({ pieces: { red: lone(5) } }), [3]).effects).toEqual([[]])
  })

  it('a non-6 after two or more 6s ends the streak', () => {
    const { effects } = rollAll(setup({ pieces: { red: lone(5) } }), [6, 6, 3])
    expect(effects[2]).toEqual([{ type: 'streakEnded', color: 'red', count: 2 }])
  })

  it('a non-6 after a single 6 is not a streak ending', () => {
    expect(rollAll(setup({ pieces: { red: lone(5) } }), [6, 3]).effects[1]).toEqual([])
  })

  it('stopping after two or more 6s ends the streak', () => {
    const { state } = rollAll(setup({ pieces: { red: lone(5) } }), [6, 6, 6])
    expect(describeRoll(state, stopRolling(state))).toEqual([{ type: 'streakEnded', color: 'red', count: 3 }])
  })

  it('a bonus roll starts a new count', () => {
    // Red kicks yellow with its only roll and rolls again under bonusRoll.
    const { state } = rollAll(setup({ afterKick: 'bonusRoll', pieces: { red: lone(5), yellow: [8] } }), [3])
    const kicked = play(state).state
    expect(kicked.turn).toBe('red')
    expect(rollAll(kicked, [6]).effects).toEqual([[{ type: 'sixStreak', color: 'red', count: 1 }]])
  })

  describe('in endsTurn mode', () => {
    const endsTurn: SetupOptions = { afterKick: 'endsTurn', pieces: { red: lone(5) } }

    it('counts the turn player’s 6s across the moves between them', () => {
      let state = setup(endsTurn)
      const counts: GameEffect[][] = []
      for (let i = 0; i < 3; i++) {
        const rolled = rollAll(state, [6])
        counts.push(rolled.effects[0])
        state = play(rolled.state).state
      }
      expect(counts).toEqual([1, 2, 3].map((count) => [{ type: 'sixStreak', color: 'red', count }]))
      expect(rollAll(state, [2]).effects[0]).toEqual([{ type: 'streakEnded', color: 'red', count: 3 }])
    })

    it('does not count the previous player’s 6s', () => {
      // Red's 6 kicks yellow on 11 and ends the turn; green's first 6 is a streak of 1.
      const { state } = rollAll(setup({ ...endsTurn, pieces: { red: lone(5), yellow: [11] } }), [6])
      const kicked = play(state, only(legalMoves(state), 'forward')).state
      expect(kicked.turn).toBe('green')
      expect(rollAll(kicked, [6]).effects[0]).toEqual([{ type: 'sixStreak', color: 'green', count: 1 }])
    })

    it('a kick ending the turn mid-streak ends the streak', () => {
      const first = play(rollAll(setup({ ...endsTurn, pieces: { red: lone(5), yellow: [17] } }), [6]).state).state
      const second = rollAll(first, [6]).state
      const { effects } = play(second, only(legalMoves(second), 'forward'))
      expect(effects).toContainEqual({ type: 'streakEnded', color: 'red', count: 2 })
    })
  })

  it('a Labourer victim’s 6 frees them', () => {
    const s = setup({ rules: { labourer: true }, turn: 'yellow', labourers: { yellow: 'red' }, pieces: { red: [5] } })
    expect(rollAll(s, [6]).effects[0]).toEqual([
      { type: 'labourerFreed', victim: 'yellow' },
      { type: 'sixStreak', color: 'yellow', count: 1 },
    ])
  })
})

describe('describeMove', () => {
  it('a plain move says nothing', () => {
    expect(play(setup({ roll: 3, pieces: { red: lone(5) } })).effects).toEqual([])
  })

  it('a forward kick is a front kick', () => {
    const { effects } = play(setup({ roll: 3, pieces: { red: lone(5), yellow: [8] } }))
    expect(effects).toEqual([{ type: 'kick', kind: 'front', at: track(8), kicker: piece('red'), victim: piece('yellow') }])
  })

  it('an enter onto a lone opponent is a front kick', () => {
    const s = setup({ roll: 6, pieces: { yellow: [0] } })
    expect(play(s, only(legalMoves(s), 'enter')).effects[0]).toMatchObject({ type: 'kick', kind: 'front', at: track(0) })
  })

  it('a back kick', () => {
    const s = setup({ rules: { backKick: true }, roll: 3, pieces: { red: lone(5), yellow: [2] } })
    expect(play(s, only(legalMoves(s), 'back')).effects).toEqual([
      { type: 'kick', kind: 'back', at: track(2), from: track(3), kicker: piece('red'), victim: piece('yellow') },
    ])
  })

  it('a back kick out of your own home lane round past the entrance is a back kick, then wicked on top', () => {
    const s = setup({ rules: { backKick: true }, roll: 5, pieces: { red: [lane('red', 4)], yellow: [51] } })
    expect(play(s, only(legalMoves(s), 'back')).effects).toEqual([
      { type: 'kick', kind: 'back', at: track(51), from: track(50), kicker: piece('red'), victim: piece('yellow') },
      { type: 'wicked', piece: piece('red'), at: track(51) },
    ])
  })

  it('a back kick out of your own home lane back along the arm is a plain back kick', () => {
    const s = setup({ rules: { backKick: true }, roll: 5, pieces: { red: [lane('red', 4)], yellow: [49] } })
    expect(play(s, only(legalMoves(s), 'back')).effects).toEqual([
      { type: 'kick', kind: 'back', at: track(49), from: track(50), kicker: piece('red'), victim: piece('yellow') },
    ])
  })

  it('a back kick on your own lane entry, straight out of the lane, stepped off lane 1', () => {
    const s = setup({ rules: { backKick: true }, roll: 2, pieces: { red: [lane('red', 2)], yellow: [50] } })
    expect(play(s, only(legalMoves(s), 'back')).effects[0]).toMatchObject({ kind: 'back', at: track(50), from: lane('red', 1) })
  })

  it('a back kick inside your own lane is not wicked', () => {
    const s = setup({ rules: { backKick: true }, roll: 2, pieces: { red: [lane('red', 4)], yellow: [lane('red', 2)] } })
    expect(play(s, only(legalMoves(s), 'back')).effects.map((e) => e.type)).toEqual(['kick'])
  })

  it('a line kick lands on the opponent’s square', () => {
    const s = setup({ rules: { lineKick: true }, roll: 2, pieces: { red: [5], yellow: [15] } })
    const move = only(legalMoves(s), 'line') as Extract<Move, { kind: 'line' }>
    expect(play(s, move).effects[0]).toMatchObject({ type: 'kick', kind: 'line', at: track(15), via: move.via })
  })

  it('a home kick', () => {
    const s = setup({ rules: { homeKick: true }, roll: 4, pieces: { red: [22], yellow: [lane('yellow', 2)] } })
    expect(play(s, only(legalMoves(s), 'homeKick')).effects[0]).toMatchObject({
      type: 'kick',
      kind: 'home',
      at: lane('yellow', 2),
    })
  })

  it('a combined move still makes one kick', () => {
    // 6 then 4 from 5: one forward move of 10 onto yellow on 15.
    const { state } = rollAll(setup({ pieces: { red: lone(5), yellow: [15] } }), [6, 4])
    const combined = legalMoves(state).find((m) => m.rolls === 2 && m.kick)!
    const { effects } = play(state, combined)
    expect(effects.filter((e) => e.type === 'kick')).toEqual([
      { type: 'kick', kind: 'front', at: track(15), kicker: piece('red'), victim: piece('yellow') },
    ])
  })

  it('kicking the victim’s last piece in play makes them a Labourer', () => {
    const { effects } = play(setup({ rules: { labourer: true }, roll: 3, pieces: { red: [5], yellow: [8] } }))
    expect(effects).toContainEqual({ type: 'labourerStart', victim: 'yellow', owner: 'red' })
  })

  it('an owner finishing frees their Labourers', () => {
    const s = setup({
      rules: { labourer: true },
      endCondition: 'playForPlaces',
      roll: 2,
      labourers: { yellow: 'red' },
      pieces: { red: [lane('red', 4), HOME, HOME, HOME] },
    })
    expect(play(s).effects).toContainEqual({ type: 'labourerFreed', victim: 'yellow' })
  })

  it('landing on your own lone piece forms a block, joining a block does not', () => {
    expect(play(setup({ roll: 3, pieces: { red: [5, 8] } }), { kind: 'forward', piece: piece('red'), to: track(8) }).effects).toEqual([
      { type: 'blockFormed', color: 'red', at: track(8) },
    ])
    const s = setup({ roll: 3, pieces: { red: [5, 8, 8] } })
    expect(play(s, { kind: 'forward', piece: piece('red'), to: track(8) }).effects).toEqual([])
  })

  it('a piece reaching home', () => {
    const { effects } = play(setup({ roll: 2, pieces: { red: [lane('red', 4)] } }))
    expect(effects).toEqual([{ type: 'pieceHome', piece: piece('red') }])
  })

  it('the last piece home finishes the player and, under firstWins, ends the game', () => {
    const { effects } = play(setup({ roll: 2, pieces: { red: [lane('red', 4), HOME, HOME, HOME] } }))
    expect(effects).toEqual([
      { type: 'pieceHome', piece: piece('red') },
      { type: 'playerFinished', color: 'red', place: 1 },
      { type: 'gameOver' },
    ])
  })

  it('playForPlaces places the last player left too', () => {
    const s = setup({ players: 2, endCondition: 'playForPlaces', roll: 2, pieces: { red: [lane('red', 4), HOME, HOME, HOME] } })
    expect(play(s).effects).toEqual([
      { type: 'pieceHome', piece: piece('red') },
      { type: 'playerFinished', color: 'red', place: 1 },
      { type: 'playerFinished', color: 'yellow', place: 2 },
      { type: 'gameOver' },
    ])
  })
})
