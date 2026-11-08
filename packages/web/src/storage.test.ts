import { createGame, roll, settingsFor } from '@ludo/engine'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearGame, loadEffects, loadGame, loadHand, loadMusic, loadSound, loadTheme, saveEffects, saveGame, saveHand, saveMusic, saveSound, saveTheme } from './storage'

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

  describe('theme', () => {
    it('defaults to following the system', () => {
      expect(loadTheme()).toBe('system')
    })

    it('persists the choice on this device', () => {
      saveTheme('dark')
      expect(localStorage.getItem('ludo-unlimited:theme')).toBe('dark')
      expect(loadTheme()).toBe('dark')
      saveTheme('light')
      expect(loadTheme()).toBe('light')
      saveTheme('system')
      expect(localStorage.getItem('ludo-unlimited:theme')).toBe('system')
      expect(loadTheme()).toBe('system')
    })

    it('ignores a stored value it does not know', () => {
      localStorage.setItem('ludo-unlimited:theme', 'sepia')
      expect(loadTheme()).toBe('system')
    })

    it('survives storage that throws', () => {
      vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new Error('blocked')
      })
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('blocked')
      })
      expect(() => saveTheme('dark')).not.toThrow()
      expect(loadTheme()).toBe('system')
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

  describe.each([
    ['sound', 'ludo-unlimited:sound', loadSound, saveSound],
    ['music', 'ludo-unlimited:music', loadMusic, saveMusic],
  ] as const)('%s', (_name, key, load, save) => {
    it('is on by default', () => {
      expect(load()).toBe(true)
    })

    it('persists the choice on this device', () => {
      save(false)
      expect(localStorage.getItem(key)).toBe('off')
      expect(load()).toBe(false)
      save(true)
      expect(localStorage.getItem(key)).toBe('on')
      expect(load()).toBe(true)
    })

    it('is kept apart from the other switch', () => {
      save(false)
      expect([loadSound(), loadMusic()].filter((on) => !on)).toHaveLength(1)
    })

    it('survives storage that throws', () => {
      vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new Error('blocked')
      })
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('blocked')
      })
      expect(() => save(false)).not.toThrow()
      expect(load()).toBe(true)
    })
  })
})
