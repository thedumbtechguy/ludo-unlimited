import { createGame, settingsFor, track } from '@ludo/engine'
import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fixedDice, seededDice } from './dice'
import { FAST_TIMING, useGame } from './useGame'

const classic2 = settingsFor('classic', 2, 'firstWins')
const humans = { red: 'human', yellow: 'human' } as const
const red0 = { color: 'red', index: 0 } as const

describe('useGame', () => {
  afterEach(() => vi.useRealTimers())

  it('a human rolls; a piece with one move plays when selected; a 6 rolls again', () => {
    const { result } = renderHook(() => useGame({ settings: classic2, seats: humans, dice: fixedDice([6]), timing: FAST_TIMING }))
    expect(result.current.humanToRoll).toBe(true)
    act(() => result.current.roll())
    expect(result.current.movable).toEqual([red0])
    act(() => result.current.select(red0))
    expect(result.current.game.players[0].pieces[0]).toEqual(track(0))
    expect(result.current.humanToRoll).toBe(true)
  })

  it('a piece with several moves shows its targets; picking one plays it', () => {
    const initial = createGame(settingsFor('ghana', 2, 'firstWins'))
    initial.players[0].pieces[0] = track(10)
    initial.players[1].pieces[0] = track(7)
    const { result } = renderHook(() =>
      useGame({ settings: initial.settings, seats: humans, dice: fixedDice([3]), timing: FAST_TIMING, initial }),
    )
    act(() => result.current.roll())
    act(() => result.current.select(red0))
    expect(result.current.targets.map((m) => m.kind).sort()).toEqual(['back', 'forward'])
    act(() => result.current.play(result.current.targets.find((m) => m.kind === 'back')!))
    expect(result.current.game.players[1].pieces[0]).toEqual({ kind: 'base' })
    expect(result.current.message).toBe('Red Back Kicked Yellow!')
  })

  it('a wasted roll says so and passes the turn', () => {
    const { result } = renderHook(() => useGame({ settings: classic2, seats: humans, dice: fixedDice([3]), timing: FAST_TIMING }))
    act(() => result.current.roll())
    expect(result.current.message).toBe('No moves')
    expect(result.current.game.turn).toBe('yellow')
  })

  it('animates a move square by square before applying it', () => {
    vi.useFakeTimers()
    const initial = createGame(classic2)
    initial.players[0].pieces[0] = track(5)
    const timing = { botRoll: 0, botMove: 0, step: 100 }
    const { result } = renderHook(() => useGame({ settings: classic2, seats: humans, dice: fixedDice([3]), timing, initial }))
    act(() => result.current.roll())
    act(() => result.current.select(red0))
    expect(result.current.moving).toEqual({ piece: red0, at: track(6) })
    expect(result.current.game.players[0].pieces[0]).toEqual(track(5))
    act(() => vi.advanceTimersByTime(100))
    expect(result.current.moving?.at).toEqual(track(7))
    act(() => vi.advanceTimersByTime(100))
    expect(result.current.moving?.at).toEqual(track(8))
    act(() => vi.advanceTimersByTime(100))
    expect(result.current.moving).toBeUndefined()
    expect(result.current.game.players[0].pieces[0]).toEqual(track(8))
  })

  it('computer seats play a whole game by themselves', async () => {
    vi.useFakeTimers()
    const dice = seededDice(3)
    const { result } = renderHook(() =>
      useGame({ settings: classic2, seats: { red: 'computer', yellow: 'computer' }, dice, timing: FAST_TIMING, random: () => 0 }),
    )
    for (let i = 0; i < 20_000 && result.current.game.status === 'playing'; i++) {
      await act(async () => {
        vi.runOnlyPendingTimers()
      })
    }
    expect(result.current.game.status).toBe('finished')
  }, 30_000)

  it('reports every new state', () => {
    const onChange = vi.fn()
    const { result } = renderHook(() =>
      useGame({ settings: classic2, seats: humans, dice: fixedDice([3]), timing: FAST_TIMING, onChange }),
    )
    act(() => result.current.roll())
    expect(onChange).toHaveBeenLastCalledWith(result.current.game)
    expect(result.current.game.log).toHaveLength(1)
  })
})
