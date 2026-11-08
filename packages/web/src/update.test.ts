import { describe, expect, it, vi } from 'vitest'
import { setPlaying, updateNow, updateReady } from './update'

describe('app updates', () => {
  it('applies a new version straight away when no game is on', () => {
    setPlaying(false)
    const reload = vi.fn()
    updateReady(reload)
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('holds a new version back during a game, then applies it when the game is over', () => {
    setPlaying(true)
    const reload = vi.fn()
    updateReady(reload)
    expect(reload).not.toHaveBeenCalled()
    setPlaying(false)
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('updates now when a room needs a newer app, even during a game', () => {
    setPlaying(true)
    const reload = vi.fn()
    updateReady(reload)
    updateNow()
    expect(reload).toHaveBeenCalledTimes(1)
  })
})
