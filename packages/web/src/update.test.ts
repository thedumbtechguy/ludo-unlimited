import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// update.ts keeps its state in the module: each test gets a fresh copy.
const fresh = () => import('./update')

describe('app updates', () => {
  beforeEach(() => {
    vi.resetModules()
    sessionStorage.clear()
  })
  afterEach(() => vi.unstubAllGlobals())

  it('applies a new version straight away when no game is on', async () => {
    const { setPlaying, updateReady } = await fresh()
    setPlaying(false)
    const reload = vi.fn()
    updateReady(reload)
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('holds a new version back during a game, then applies it when the game is over', async () => {
    const { setPlaying, updateReady } = await fresh()
    setPlaying(true)
    const reload = vi.fn()
    updateReady(reload)
    expect(reload).not.toHaveBeenCalled()
    setPlaying(false)
    expect(reload).toHaveBeenCalledTimes(1)
  })

  describe('when a room needs a newer app', () => {
    it('applies a waiting version now, even during a game', async () => {
      const { setPlaying, updateNow, updateReady } = await fresh()
      setPlaying(true)
      const reload = vi.fn()
      updateReady(reload)
      expect(updateNow('KQMZ')).toBe(true)
      expect(reload).toHaveBeenCalledTimes(1)
    })

    it('asks the service worker for one, and applies it as soon as it is ready', async () => {
      const { setPlaying, setRegistration, updateNow, updateReady } = await fresh()
      const update = vi.fn().mockResolvedValue(undefined)
      setRegistration({ update } as unknown as ServiceWorkerRegistration)
      setPlaying(true)
      updateNow('KQMZ')
      expect(update).toHaveBeenCalled()
      const reload = vi.fn()
      updateReady(reload)
      expect(reload).toHaveBeenCalledTimes(1)
    })

    it('reloads without a service worker, but only once per room', async () => {
      const reload = vi.fn()
      vi.stubGlobal('location', { ...location, reload })
      const { updateNow } = await fresh()
      expect(updateNow('KQMZ')).toBe(true)
      expect(reload).toHaveBeenCalledTimes(1)
      // After the reload the app is still too old: stop, rather than reload forever.
      vi.resetModules()
      expect((await fresh()).updateNow('KQMZ')).toBe(false)
      expect(reload).toHaveBeenCalledTimes(1)
      // Another room gets its own try.
      expect((await fresh()).updateNow('ABCD')).toBe(true)
    })

    it('does not reload when storage is blocked, as it could not tell a second try', async () => {
      const reload = vi.fn()
      vi.stubGlobal('location', { ...location, reload })
      vi.stubGlobal('sessionStorage', {
        getItem: () => {
          throw new Error('blocked')
        },
      })
      const { updateNow } = await fresh()
      expect(updateNow('KQMZ')).toBe(false)
      expect(reload).not.toHaveBeenCalled()
    })
  })
})
