import { createGame, HOME, roll, settingsFor, track } from '@ludo/engine'
import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FAST_TIMING } from './useGame'
import { useGameView } from './useGameView'

const settings = settingsFor('classic', 2, 'firstWins')

describe('useGameView', () => {
  afterEach(() => vi.useRealTimers())

  it('plays events from any source, in order, even while one is animating', () => {
    vi.useFakeTimers()
    const timing = { botRoll: 0, botMove: 0, step: 100, roll: 300 }
    const { result } = renderHook(() => useGameView({ initial: createGame(settings), timing, controls: () => false, act: vi.fn() }))
    act(() => {
      result.current.enqueue({ type: 'roll', value: 6 })
      result.current.enqueue({ type: 'roll', value: 2 })
    })
    expect(result.current.rolling).toBe(true)
    act(() => vi.advanceTimersByTime(300))
    expect(result.current.game.queuedRolls).toEqual([6])
    act(() => vi.advanceTimersByTime(300))
    expect(result.current.game.pendingRoll).toBe(6)
  })

  it('a person’s actions become intents for the source, not changes to the game', () => {
    const intents = vi.fn()
    const { result } = renderHook(() => useGameView({ initial: createGame(settings), timing: FAST_TIMING, controls: () => true, act: intents }))
    act(() => result.current.roll())
    expect(intents).toHaveBeenCalledWith({ t: 'roll' })
    expect(result.current.game.log).toEqual([])
  })

  it('reset replaces the game and drops anything queued', () => {
    const { result } = renderHook(() => useGameView({ initial: createGame(settings), timing: FAST_TIMING, controls: () => false, act: vi.fn() }))
    const later = createGame(settings)
    later.players[0].pieces[0] = track(9)
    act(() => result.current.reset(later))
    expect(result.current.game.players[0].pieces[0]).toEqual(track(9))
  })

  it('reset during a tumble drops the roll in flight and the events behind it', () => {
    vi.useFakeTimers()
    const timing = { botRoll: 0, botMove: 0, step: 100, roll: 300 }
    const { result } = renderHook(() => useGameView({ initial: createGame(settings), timing, controls: () => false, act: vi.fn() }))
    act(() => {
      result.current.enqueue({ type: 'roll', value: 6 })
      result.current.enqueue({ type: 'roll', value: 2 })
    })
    act(() => result.current.reset(createGame(settings)))
    act(() => vi.advanceTimersByTime(1000))
    expect(result.current.rolling).toBe(false)
    expect(result.current.busy).toBe(false)
    expect(result.current.game.log).toEqual([])
  })

  it('a person’s single real choice is played through act after timing.botMove', () => {
    vi.useFakeTimers()
    const initial = createGame(settings)
    initial.players[0].pieces = [track(5), HOME, HOME, HOME]
    const intents = vi.fn()
    const timing = { botRoll: 0, botMove: 400, step: 0, roll: 0 }
    renderHook(() => useGameView({ initial: roll(initial, 3), timing, controls: () => true, act: intents }))
    act(() => vi.advanceTimersByTime(399))
    expect(intents).not.toHaveBeenCalled()
    act(() => vi.advanceTimersByTime(1))
    expect(intents).toHaveBeenCalledTimes(1)
    expect(intents).toHaveBeenCalledWith({ t: 'move', move: expect.objectContaining({ piece: { color: 'red', index: 0 }, to: track(8) }) })
  })
})
