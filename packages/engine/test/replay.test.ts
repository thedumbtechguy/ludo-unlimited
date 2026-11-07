import { describe, expect, it } from 'vitest'
import { replay } from '../src/game'
import type { GameState } from '../src/types'
import { playRandom, randomSettings, rng } from './random'

describe('replay', () => {
  it.each([1, 2, 3, 4, 5])('rebuilds the same state from the log (seed %i)', (seed) => {
    let last: GameState | undefined
    for (const state of playRandom(randomSettings(rng(seed)), seed, 3000)) last = state
    expect(replay(last!.settings, last!.log)).toEqual(last)
  })
})
