import { lane, track } from '@ludo/engine'
import { describe, expect, it } from 'vitest'
import { describePosition, kickMessage, pieceLabel, targetLabel } from './labels'

describe('labels', () => {
  it('describes positions', () => {
    expect(describePosition({ kind: 'base' })).toBe('in base')
    expect(describePosition({ kind: 'home' })).toBe('home')
    expect(describePosition(track(8))).toBe('on square 9')
    expect(describePosition(lane('yellow', 2))).toBe("in Yellow's home lane, square 2")
  })

  it('labels pieces and targets', () => {
    expect(pieceLabel({ color: 'red', index: 0 }, track(8))).toBe('Red piece 1, on square 9')
    expect(targetLabel({ kind: 'forward', piece: { color: 'red', index: 0 }, to: track(8) })).toBe('Move on square 9')
    expect(
      targetLabel({ kind: 'forward', piece: { color: 'red', index: 0 }, to: track(8), kick: { color: 'yellow', index: 0 } }),
    ).toBe('Kick Yellow on square 9')
  })

  it('announces kicks by kind', () => {
    const piece = { color: 'red', index: 0 } as const
    const kick = { color: 'yellow', index: 0 } as const
    expect(kickMessage({ kind: 'line', piece, via: track(7), to: track(15), kick })).toBe('Red Line Kicked Yellow!')
    expect(kickMessage({ kind: 'forward', piece, to: track(8), kick })).toBe('Red kicked Yellow!')
    expect(kickMessage({ kind: 'forward', piece, to: track(8) })).toBeUndefined()
  })
})
