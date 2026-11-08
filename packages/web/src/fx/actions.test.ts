import { lane, track, type GameEffect } from '@ludo/engine'
import { describe, expect, it } from 'vitest'
import { positionPoint } from '../layout'
import { effectActions, SPARKS } from './actions'

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

  it('the six streak is shown elsewhere', () => {
    expect(effectActions(event({ type: 'sixStreak', color: 'red', count: 3 }), 'full')).toEqual([])
  })
})
