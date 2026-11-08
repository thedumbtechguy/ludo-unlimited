import { createGame, roll, settingsFor } from '@ludo/engine'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearGame, loadGame, saveGame } from './storage'

const settings = settingsFor('ghana', 2, 'firstWins')

describe('storage', () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => vi.restoreAllMocks())

  it('round-trips a saved game', () => {
    const log = roll(createGame(settings), 3).log
    saveGame({ settings, seats: { red: 'human', yellow: 'computer' }, log })
    expect(loadGame()).toEqual({ settings, seats: { red: 'human', yellow: 'computer' }, log })
  })

  it('is empty when nothing is saved, or after clearing', () => {
    expect(loadGame()).toBeUndefined()
    saveGame({ settings, seats: {}, log: [] })
    clearGame()
    expect(loadGame()).toBeUndefined()
  })

  it('ignores a log that no longer replays', () => {
    saveGame({ settings, seats: {}, log: [{ type: 'roll', value: 9 }] })
    expect(loadGame()).toBeUndefined()
  })

  it('survives storage that throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(() => saveGame({ settings, seats: {}, log: [] })).not.toThrow()
    expect(loadGame()).toBeUndefined()
  })
})
