import { describe, expect, it } from 'vitest'
import { LINE_ACROSS, TRACK, entryIndex, laneCell, startIndex } from '../src/board'
import { lane } from '../src/position'
import { COLORS } from '../src/types'

const touches = (a: readonly number[], b: readonly number[]) =>
  Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1])) === 1

describe('board geometry', () => {
  it('has 52 unique track squares', () => {
    expect(TRACK).toHaveLength(52)
    expect(new Set(TRACK.map((c) => c.join(','))).size).toBe(52)
  })

  it('is a closed loop of touching squares', () => {
    TRACK.forEach((cell, i) => expect(touches(cell, TRACK[(i + 1) % 52])).toBe(true))
  })

  it('puts start squares where the conventions say', () => {
    expect(TRACK[startIndex('red')]).toEqual([1, 6])
    expect(TRACK[startIndex('green')]).toEqual([8, 1])
    expect(TRACK[startIndex('yellow')]).toEqual([13, 8])
    expect(TRACK[startIndex('blue')]).toEqual([6, 13])
  })

  it('puts lane entries on the arm tips', () => {
    expect(TRACK[entryIndex('red')]).toEqual([0, 7])
    expect(TRACK[entryIndex('green')]).toEqual([7, 0])
    expect(TRACK[entryIndex('yellow')]).toEqual([14, 7])
    expect(TRACK[entryIndex('blue')]).toEqual([7, 14])
  })

  it('starts each lane next to its entry', () => {
    for (const color of COLORS) expect(touches(laneCell(color, 1), TRACK[entryIndex(color)])).toBe(true)
  })

  it('pairs 40 squares across lanes, symmetrically', () => {
    expect(LINE_ACROSS.size).toBe(40)
    for (const [index, pair] of LINE_ACROSS) expect(LINE_ACROSS.get(pair.across)?.across).toBe(index)
  })

  it('pairs track 7 and 15 across green lane 3', () => {
    expect(LINE_ACROSS.get(7)).toEqual({ across: 15, between: lane('green', 3) })
  })

  it('pairs red start with track 48 across red lane 1', () => {
    expect(LINE_ACROSS.get(0)).toEqual({ across: 48, between: lane('red', 1) })
  })

  it('never pairs row 0 (the arm tips)', () => {
    for (const index of [10, 12, 49, 51]) expect(LINE_ACROSS.has(index)).toBe(false)
  })
})
