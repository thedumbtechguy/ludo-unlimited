import { describe, expect, it } from 'vitest'
import { ANIMATION_TIMING, eventMs, LAND_MS, WICKED_DELAY } from '../src/pace'
import { lane, track } from '../src/position'
import { piece, setup } from './helpers'

describe('eventMs', () => {
  it('a roll takes the dice animation', () => {
    expect(eventMs(setup(), { type: 'roll', value: 3 })).toBe(ANIMATION_TIMING.roll)
  })

  it('a move takes a step per square, then the landing', () => {
    const s = setup({ roll: 3, pieces: { red: [5] } })
    expect(eventMs(s, { type: 'move', move: { kind: 'forward', piece: piece('red'), to: track(8) } })).toBe(3 * ANIMATION_TIMING.step + LAND_MS)
  })

  it('a wicked kick waits for "Wicked!" on top', () => {
    const s = setup({ rules: { backKick: true }, roll: 6, pieces: { red: [lane('red', 4)], yellow: [0] } })
    const move = { kind: 'back' as const, piece: piece('red'), to: track(0), kick: piece('yellow') }
    expect(eventMs(s, { type: 'move', move })).toBe(6 * ANIMATION_TIMING.step + LAND_MS + WICKED_DELAY)
  })

  it('stopping and passing are instant', () => {
    expect(eventMs(setup(), { type: 'stop' })).toBe(0)
    expect(eventMs(setup(), { type: 'pass' })).toBe(0)
  })
})
