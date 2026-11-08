import { createGame, lane, settingsFor, track, type GameEffect } from '@ludo/engine'
import { describe, expect, it } from 'vitest'
import { positionPoint } from '../layout'
import { cameFrom, CONFETTI, effectActions, FINISH_BURST, resultsDelay, ROCKETS, SHELL, FOUNTAIN, SHARDS, SMOKE, SPARKS, SPEED_LINES, yardCentre } from './actions'

const state = createGame(settingsFor('ghana', 4, 'firstWins'))
const red0 = { color: 'red', index: 0 } as const
const yellow0 = { color: 'yellow', index: 0 } as const
const event = (effect: GameEffect, id = 1) => ({ ...effect, id })
const kick = (kind: Extract<GameEffect, { type: 'kick' }>['kind'], at = track(15)) =>
  event({ type: 'kick', kind, at, kicker: red0, victim: yellow0 })
const types = (actions: { type: string }[]) => actions.map((a) => a.type)

describe('effect actions', () => {
  it('a kick flashes on the square, sparks in the kicker’s colour and shakes the board', () => {
    const at = positionPoint(track(15), red0)
    expect(effectActions(kick('front'), 'full', state)).toEqual([
      { type: 'flash', at, color: 'red' },
      { type: 'sparks', at, color: 'red', count: SPARKS },
      { type: 'shake', px: 5, ms: 200 },
    ])
  })

  it('shakes at most 6px, for about 200ms', () => {
    for (const kind of ['front', 'back', 'line', 'home', 'wicked'] as const) {
      const shake = effectActions(kick(kind, kind === 'home' ? lane('yellow', 2) : track(15)), 'full', state).find((a) => a.type === 'shake')
      expect(shake).toMatchObject({ ms: 200 })
      expect((shake as { px: number }).px).toBeLessThanOrEqual(6)
    }
  })

  it('never shakes with reduced effects, but still flashes and sparks', () => {
    expect(types(effectActions(kick('front'), 'reduced', state))).toEqual(['flash', 'sparks'])
  })

  it('a back kick whips: speed lines from the square it came off, one along the track', () => {
    const actions = effectActions(kick('back'), 'full', state)
    expect(types(actions)).toEqual(['flash', 'sparks', 'shake', 'whip'])
    expect(actions[3]).toEqual({ type: 'whip', at: positionPoint(track(15), red0), from: positionPoint(track(16), red0), kicker: red0, count: SPEED_LINES })
  })

  it('the wicked move whips out of the lane and leaves dark smoke', () => {
    const actions = effectActions(kick('wicked', track(50)), 'full', state)
    expect(types(actions)).toEqual(['flash', 'sparks', 'shake', 'whip', 'smoke'])
    expect(actions[2]).toEqual({ type: 'shake', px: 6, ms: 200 })
    expect(actions[4]).toMatchObject({ type: 'smoke', count: SMOKE })
    // Red's entry square is 50: one step on along red's route is into its own lane.
    expect(cameFrom('wicked', track(50), red0)).toEqual(lane('red', 1))
    expect(cameFrom('back', track(51), red0)).toEqual(track(0))
  })

  it('a line kick zaps from the square it crossed from, before the impact', () => {
    const effect = event({ type: 'kick', kind: 'line', at: track(15), via: track(7), kicker: red0, victim: yellow0 })
    const actions = effectActions(effect, 'full', state)
    expect(actions[0]).toEqual({ type: 'bolt', from: positionPoint(track(7), red0), to: positionPoint(track(15), red0), color: 'red' })
    expect(types(actions)).toEqual(['bolt', 'flash', 'sparks', 'shake'])
  })

  it('a home kick ripples down every square of the lane it kicked into', () => {
    const actions = effectActions(kick('home', lane('yellow', 2)), 'full', state)
    const ripple = actions.find((a) => a.type === 'ripple')
    expect(ripple).toEqual({ type: 'ripple', color: 'red', squares: [1, 2, 3, 4, 5].map((index) => positionPoint(lane('yellow', index), red0)) })
  })

  it('a Labourer slams chains on the victim’s yard with a thud, and they shatter when it’s freed', () => {
    expect(effectActions(event({ type: 'labourerStart', victim: 'green', owner: 'red' }, 7), 'full', state)).toEqual([
      { type: 'chains', victim: 'green', id: 7 },
      { type: 'shake', px: 3, ms: 140 },
    ])
    expect(types(effectActions(event({ type: 'labourerStart', victim: 'green', owner: 'red' }), 'reduced', state))).toEqual(['chains'])
    expect(effectActions(event({ type: 'labourerFreed', victim: 'green' }), 'full', state)).toEqual([{ type: 'shatter', victim: 'green', count: SHARDS }])
  })

  it('a new block shimmers; a piece home throws a fountain from the centre; a finished player gets a burst', () => {
    expect(effectActions(event({ type: 'blockFormed', color: 'red', at: track(5) }, 9), 'full', state)).toEqual([{ type: 'shimmer', at: track(5), color: 'red', id: 9 }])
    expect(effectActions(event({ type: 'pieceHome', piece: red0 }), 'full', state)).toEqual([
      { type: 'fountain', at: positionPoint({ kind: 'home' }, red0), color: 'red', count: FOUNTAIN },
    ])
    expect(effectActions(event({ type: 'playerFinished', color: 'yellow', place: 1 }), 'reduced', state)).toEqual([
      { type: 'burst', at: yardCentre('yellow'), color: 'yellow', count: FINISH_BURST },
    ])
  })

  it('the win: fireworks in the winner’s colour, then confetti', () => {
    const won = createGame(settingsFor('ghana', 4, 'firstWins'))
    won.players[2].finishedPlace = 1
    expect(effectActions(event({ type: 'gameOver' }), 'full', won)).toEqual([
      { type: 'fireworks', color: 'yellow', rockets: ROCKETS, count: SHELL },
      { type: 'confetti', count: CONFETTI },
    ])
    expect(CONFETTI).toBe(120)
  })

  it('the six streak is shown elsewhere', () => {
    expect(effectActions(event({ type: 'sixStreak', color: 'red', count: 3 }), 'full', state)).toEqual([])
  })
})

describe('the results screen after a win', () => {
  it('waits about 1.6s on full effects so the fireworks and confetti play out', () => {
    expect(resultsDelay(true, 'full')).toBe(1600)
  })

  it('waits less for the short reduced version, and not at all with effects off (?fast)', () => {
    expect(resultsDelay(true, 'reduced')).toBeLessThan(1600)
    expect(resultsDelay(true, 'reduced')).toBeGreaterThan(0)
    expect(resultsDelay(false, 'full')).toBe(0)
    expect(resultsDelay(false, 'reduced')).toBe(0)
  })
})
