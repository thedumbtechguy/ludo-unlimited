import { lane, track, type GameEffect } from '@ludo/engine'
import { describe, expect, it } from 'vitest'
import { positionPoint } from '../layout'
import { cameFrom, effectActions, SMOKE, SPARKS, SPEED_LINES } from './actions'

const red0 = { color: 'red', index: 0 } as const
const yellow0 = { color: 'yellow', index: 0 } as const
const event = (effect: GameEffect, id = 1) => ({ ...effect, id })
const kick = (kind: Extract<GameEffect, { type: 'kick' }>['kind'], at = track(15)) =>
  event({ type: 'kick', kind, at, kicker: red0, victim: yellow0 })
const types = (actions: { type: string }[]) => actions.map((a) => a.type)

describe('effect actions', () => {
  it('a kick flashes on the square, sparks in the kicker’s colour and shakes the board', () => {
    const at = positionPoint(track(15), red0)
    expect(effectActions(kick('front'), 'full')).toEqual([
      { type: 'flash', at, color: 'red' },
      { type: 'sparks', at, color: 'red', count: SPARKS },
      { type: 'shake', px: 5, ms: 200 },
    ])
  })

  it('shakes at most 6px, for about 200ms', () => {
    for (const kind of ['front', 'back', 'line', 'home', 'wicked'] as const) {
      const shake = effectActions(kick(kind, kind === 'home' ? lane('yellow', 2) : track(15)), 'full').find((a) => a.type === 'shake')
      expect(shake).toMatchObject({ ms: 200 })
      expect((shake as { px: number }).px).toBeLessThanOrEqual(6)
    }
  })

  it('never shakes with reduced effects, but still flashes and sparks', () => {
    expect(types(effectActions(kick('front'), 'reduced'))).toEqual(['flash', 'sparks'])
  })

  it('a back kick whips: speed lines from the square it came off, one along the track', () => {
    const actions = effectActions(kick('back'), 'full')
    expect(types(actions)).toEqual(['flash', 'sparks', 'shake', 'whip'])
    expect(actions[3]).toEqual({ type: 'whip', at: positionPoint(track(15), red0), from: positionPoint(track(16), red0), kicker: red0, count: SPEED_LINES })
  })

  it('the wicked move whips out of the lane and leaves dark smoke', () => {
    const actions = effectActions(kick('wicked', track(50)), 'full')
    expect(types(actions)).toEqual(['flash', 'sparks', 'shake', 'whip', 'smoke'])
    expect(actions[2]).toEqual({ type: 'shake', px: 6, ms: 200 })
    expect(actions[4]).toMatchObject({ type: 'smoke', count: SMOKE })
    // Red's entry square is 50: one step on along red's route is into its own lane.
    expect(cameFrom('wicked', track(50), red0)).toEqual(lane('red', 1))
    expect(cameFrom('back', track(51), red0)).toEqual(track(0))
  })

  it('a line kick zaps from the square it crossed from, before the impact', () => {
    const effect = event({ type: 'kick', kind: 'line', at: track(15), via: track(7), kicker: red0, victim: yellow0 })
    const actions = effectActions(effect, 'full')
    expect(actions[0]).toEqual({ type: 'bolt', from: positionPoint(track(7), red0), to: positionPoint(track(15), red0), color: 'red' })
    expect(types(actions)).toEqual(['bolt', 'flash', 'sparks', 'shake'])
  })

  it('a home kick ripples down every square of the lane it kicked into', () => {
    const actions = effectActions(kick('home', lane('yellow', 2)), 'full')
    const ripple = actions.find((a) => a.type === 'ripple')
    expect(ripple).toEqual({ type: 'ripple', color: 'red', squares: [1, 2, 3, 4, 5].map((index) => positionPoint(lane('yellow', index), red0)) })
  })

  it('the six streak is shown elsewhere', () => {
    expect(effectActions(event({ type: 'sixStreak', color: 'red', count: 3 }), 'full')).toEqual([])
  })
})
