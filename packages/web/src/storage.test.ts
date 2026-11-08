import { createGame, roll, settingsFor } from '@ludo/engine'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearGame, loadEffects, loadGame, loadHand, saveEffects, saveGame, saveHand } from './storage'

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

  describe('playing hand', () => {
    it('defaults to right', () => {
      expect(loadHand()).toBe('right')
    })

    it('persists the chosen hand on this device', () => {
      saveHand('left')
      expect(localStorage.getItem('ludo-unlimited:hand')).toBe('left')
      expect(loadHand()).toBe('left')
      saveHand('right')
      expect(loadHand()).toBe('right')
    })

    it('ignores a stored value it does not know', () => {
      localStorage.setItem('ludo-unlimited:hand', 'sideways')
      expect(loadHand()).toBe('right')
    })

    it('survives storage that throws', () => {
      vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new Error('blocked')
      })
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('blocked')
      })
      expect(() => saveHand('left')).not.toThrow()
      expect(loadHand()).toBe('right')
    })
  })

  describe('effects', () => {
    it('defaults to full, or reduced when the device asks for reduced motion', () => {
      expect(loadEffects()).toBe('full')
      const original = matchMedia
      vi.stubGlobal('matchMedia', (query: string) => ({ matches: query === '(prefers-reduced-motion: reduce)' }))
      expect(loadEffects()).toBe('reduced')
      vi.stubGlobal('matchMedia', original)
    })

    it('persists the choice on this device', () => {
      saveEffects('reduced')
      expect(localStorage.getItem('ludo-unlimited:effects')).toBe('reduced')
      expect(loadEffects()).toBe('reduced')
      saveEffects('full')
      expect(loadEffects()).toBe('full')
    })

    it('ignores a stored value it does not know', () => {
      localStorage.setItem('ludo-unlimited:effects', 'loud')
      expect(loadEffects()).toBe('full')
    })

    it('survives storage that throws', () => {
      vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new Error('blocked')
      })
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('blocked')
      })
      expect(() => saveEffects('reduced')).not.toThrow()
      expect(loadEffects()).toBe('full')
    })
  })
})
