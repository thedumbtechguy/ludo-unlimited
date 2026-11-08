import { describe, expect, it } from 'vitest'
import { backwardPath, forwardPath, isClear } from '../src/path'
import { BASE, HOME, lane, track } from '../src/position'
import { setup } from './helpers'

describe('forwardPath', () => {
  it('turns into its own lane at its entry', () => {
    expect(forwardPath('red', track(48), 4)).toEqual([track(49), track(50), lane('red', 1), lane('red', 2)])
  })

  it('walks past other colours’ entries', () => {
    expect(forwardPath('red', track(10), 3)).toEqual([track(11), track(12), track(13)])
    expect(forwardPath('green', track(10), 3)).toEqual([track(11), lane('green', 1), lane('green', 2)])
  })

  it('wraps from 51 to 0', () => {
    expect(forwardPath('green', track(51), 2)).toEqual([track(0), track(1)])
  })

  it('needs an exact roll for home', () => {
    expect(forwardPath('red', lane('red', 4), 2)).toEqual([lane('red', 5), HOME])
    expect(forwardPath('red', lane('red', 4), 3)).toBeNull()
  })

  it('leads out of an opponent’s lane back to the track', () => {
    expect(forwardPath('red', lane('yellow', 2), 4)).toEqual([lane('yellow', 1), track(24), track(25), track(26)])
  })

  it('cannot move from base or home', () => {
    expect(forwardPath('red', BASE, 1)).toBeNull()
    expect(forwardPath('red', HOME, 1)).toBeNull()
  })
})

describe('backwardPath', () => {
  it('wraps backwards past index 0', () => {
    expect(backwardPath('red', track(1), 3)).toEqual([track(0), track(51), track(50)])
  })

  it('runs out of your own lane back along the arm', () => {
    expect(backwardPath('red', lane('red', 2), 3)).toEqual([lane('red', 1), track(50), track(49)])
  })

  it('cannot run backwards in an opponent’s lane, or from base or home', () => {
    expect(backwardPath('red', lane('yellow', 2), 1)).toBeNull()
    expect(backwardPath('red', BASE, 1)).toBeNull()
    expect(backwardPath('red', HOME, 1)).toBeNull()
  })
})

describe('isClear', () => {
  it('is blocked by an opponent block, but not by your own', () => {
    const s = setup({ pieces: { yellow: [7, 7] } })
    const path = [track(6), track(7), track(8)]
    expect(isClear(s, path, 'red')).toBe(false)
    expect(isClear(s, path, 'yellow')).toBe(true)
  })

  it('is not blocked by a lone opponent', () => {
    const s = setup({ pieces: { yellow: [7] } })
    expect(isClear(s, [track(6), track(7), track(8)], 'red')).toBe(true)
  })
})
