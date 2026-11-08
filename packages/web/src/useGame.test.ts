import { createGame, settingsFor, track } from '@ludo/engine'
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fixedDice, seededDice } from './dice'
import { FAST_TIMING, useGame } from './useGame'

const classic2 = settingsFor('classic', 2, 'firstWins')
const humans = { red: 'human', yellow: 'human' } as const
const red0 = { color: 'red', index: 0 } as const

describe('useGame', () => {
  afterEach(() => vi.useRealTimers())

  it('a human with exactly one legal move has it played automatically', async () => {
    const dice = fixedDice([6, 3])
    const { result } = renderHook(() => useGame({ settings: classic2, seats: humans, dice, timing: FAST_TIMING }))
    expect(result.current.humanToRoll).toBe(true)
    act(() => result.current.roll())
    expect(result.current.humanToRoll).toBe(true) // a 6: roll again before moving
    act(() => result.current.roll())
    // The 6 can only enter and the 3 can only advance that piece: both play themselves.
    await waitFor(() => expect(result.current.game.players[0].pieces[0]).toEqual(track(3)))
    expect(result.current.game.turn).toBe('yellow')
  })

  it('auto-plays the single move after timing.botMove', () => {
    vi.useFakeTimers()
    const timing = { botRoll: 0, botMove: 400, step: 0, roll: 0 }
    const dice = fixedDice([6, 3])
    const { result } = renderHook(() => useGame({ settings: classic2, seats: humans, dice, timing }))
    act(() => result.current.roll())
    act(() => result.current.roll())
    expect(result.current.game.pendingRoll).toBe(6)
    act(() => vi.advanceTimersByTime(399))
    expect(result.current.game.players[0].pieces[0]).toEqual({ kind: 'base' })
    act(() => vi.advanceTimersByTime(1))
    expect(result.current.game.players[0].pieces[0]).toEqual(track(0))
  })

  it('with several legal moves the human still chooses', () => {
    const initial = createGame(classic2)
    initial.players[0].pieces[0] = track(5)
    const dice = fixedDice([6, 3])
    const { result } = renderHook(() =>
      useGame({ settings: classic2, seats: humans, dice, timing: FAST_TIMING, initial }),
    )
    act(() => result.current.roll())
    act(() => result.current.roll())
    expect(result.current.movable).toHaveLength(2)
    expect(result.current.game.pendingRoll).toBeDefined()
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
    const timing = { botRoll: 0, botMove: 0, step: 100, roll: 0 }
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

  it('deselect clears the selection and targets', () => {
    const initial = createGame(settingsFor('ghana', 2, 'firstWins'))
    initial.players[0].pieces[0] = track(10)
    initial.players[1].pieces[0] = track(7)
    const { result } = renderHook(() =>
      useGame({ settings: initial.settings, seats: humans, dice: fixedDice([3]), timing: FAST_TIMING, initial }),
    )
    act(() => result.current.roll())
    act(() => result.current.select(red0))
    expect(result.current.selected).toEqual(red0)
    expect(result.current.targets.length).toBeGreaterThan(0)
    const selectedTargets = result.current.targets
    act(() => result.current.deselect())
    expect(result.current.selected).toBeUndefined()
    // With nothing selected, every movable piece's targets show again (here a single piece).
    expect(result.current.targets).toEqual(selectedTargets)
  })

  describe('rolling phase and the roll tray', () => {
    it('rolling a 6 as a human leaves turnRolls [6] and allows stop()', () => {
      const { result } = renderHook(() => useGame({ settings: classic2, seats: humans, dice: fixedDice([6]), timing: FAST_TIMING }))
      act(() => result.current.roll())
      expect(result.current.turnRolls).toEqual([6])
      expect(result.current.currentIndex).toBeUndefined()
      expect(result.current.canStop).toBe(true)
      expect(result.current.humanToRoll).toBe(true)
      expect(result.current.message).toBeUndefined()
    })

    it('stop() moves to playing the rolls so far', () => {
      const initial = createGame(classic2)
      initial.players[0].pieces[0] = track(5)
      const { result } = renderHook(() =>
        useGame({ settings: classic2, seats: humans, dice: fixedDice([6]), timing: FAST_TIMING, initial }),
      )
      act(() => result.current.roll())
      act(() => result.current.roll())
      expect(result.current.turnRolls).toEqual([6, 6])
      act(() => result.current.stop())
      expect(result.current.game.pendingRoll).toBe(6)
      expect(result.current.turnRolls).toEqual([6, 6])
      expect(result.current.currentIndex).toBe(0)
      expect(result.current.canStop).toBe(false)
      expect(result.current.humanToMove).toBe(true)
      expect(result.current.message).toBeUndefined()
    })

    it('a computer never gets canStop', () => {
      const { result } = renderHook(() =>
        useGame({ settings: classic2, seats: { red: 'human', yellow: 'computer' }, dice: fixedDice([6]), timing: FAST_TIMING, initial: { ...createGame(classic2), turn: 'yellow', queuedRolls: [6] } }),
      )
      expect(result.current.canStop).toBe(false)
    })

    it('a combined-kick target is exposed in the targets, with every movable piece’s targets shown', () => {
      const settings = settingsFor('classic', 4, 'firstWins')
      const initial = createGame(settings)
      initial.players[0].pieces[0] = track(5)
      initial.players.find((p) => p.color === 'yellow')!.pieces[0] = track(13)
      const dice = fixedDice([6, 2])
      const { result } = renderHook(() => useGame({ settings, seats: { red: 'human' }, dice, timing: FAST_TIMING, initial }),
      )
      act(() => result.current.roll())
      act(() => result.current.roll())
      expect(result.current.turnRolls).toEqual([6, 2])
      expect(result.current.currentIndex).toBe(0)
      expect(result.current.movable).toEqual([red0, { color: 'red', index: 1 }])
      expect(result.current.targets).toContainEqual({ kind: 'forward', piece: red0, to: track(13), kick: { color: 'yellow', index: 0 }, rolls: 2 })
      expect(result.current.targets).toHaveLength(3)
    })
  })

  describe('labourer turns', () => {
    const ghana2 = settingsFor('ghana', 2, 'firstWins')
    const labourerGame = () => {
      const initial = createGame(ghana2)
      initial.players[0].pieces[0] = track(5)
      initial.labourers = { yellow: 'red' }
      initial.turn = 'yellow'
      return initial
    }

    it('a computer owner moves automatically for a human victim', async () => {
      vi.useFakeTimers()
      const { result } = renderHook(() =>
        useGame({ settings: ghana2, seats: { yellow: 'human', red: 'computer' }, dice: fixedDice([3]), timing: FAST_TIMING, initial: labourerGame() }),
      )
      act(() => result.current.roll())
      await act(async () => {
        vi.runOnlyPendingTimers()
      })
      await act(async () => {
        vi.runOnlyPendingTimers()
      })
      expect(result.current.game.players[0].pieces[0]).toEqual(track(8))
      expect(result.current.game.turn).toBe('red')
    })

    it('a human owner moves for a computer victim', async () => {
      vi.useFakeTimers()
      const { result } = renderHook(() =>
        useGame({ settings: ghana2, seats: { yellow: 'computer', red: 'human' }, dice: fixedDice([3]), timing: FAST_TIMING, initial: labourerGame() }),
      )
      await act(async () => {
        vi.runOnlyPendingTimers()
      })
      expect(result.current.humanToMove).toBe(true)
      expect(result.current.movable).toEqual([red0])
    })
  })

  it('tumbles before applying a roll when timing.roll is set', () => {
    vi.useFakeTimers()
    const timing = { botRoll: 0, botMove: 0, step: 0, roll: 650 }
    const { result } = renderHook(() => useGame({ settings: classic2, seats: humans, dice: fixedDice([3]), timing }))
    expect(result.current.humanToRoll).toBe(true)
    act(() => result.current.roll())
    expect(result.current.rolling).toBe(true)
    expect(result.current.humanToRoll).toBe(false)
    expect(result.current.game.pendingRoll).toBeUndefined()
    expect(result.current.lastRoll).toBeUndefined()
    act(() => vi.advanceTimersByTime(649))
    expect(result.current.rolling).toBe(true)
    act(() => vi.advanceTimersByTime(1))
    expect(result.current.rolling).toBe(false)
    expect(result.current.lastRoll).toBe(3)
    expect(result.current.message).toBe('No moves')
    expect(result.current.game.turn).toBe('yellow')
  })

  it('does not let a bot roll again while a roll is tumbling', () => {
    vi.useFakeTimers()
    const timing = { botRoll: 0, botMove: 0, step: 0, roll: 650 }
    const dice = vi.fn(() => 3)
    const { result } = renderHook(() => useGame({ settings: classic2, seats: { red: 'computer', yellow: 'human' }, dice, timing }))
    act(() => vi.advanceTimersByTime(300))
    expect(result.current.rolling).toBe(true)
    expect(dice).toHaveBeenCalledTimes(1)
    act(() => vi.advanceTimersByTime(350))
    expect(result.current.rolling).toBe(false)
    expect(dice).toHaveBeenCalledTimes(1)
  })
})
