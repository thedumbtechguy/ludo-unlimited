import { createGame, HOME, settingsFor, track } from '@ludo/engine'
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fixedDice, seededDice } from './dice'
import * as sound from './fx/sound'
import { useEffectStream } from './fx/stream'
import { FAST_TIMING, useGame } from './useGame'

const classic2 = settingsFor('classic', 2, 'firstWins')
const humans = { red: 'human', yellow: 'human' } as const
const red0 = { color: 'red', index: 0 } as const

describe('useGame', () => {
  afterEach(() => vi.useRealTimers())

  // Red's only piece in play is on 5, the rest are home: any roll under 6 has exactly one move.
  const lonePiece = () => {
    const initial = createGame(classic2)
    initial.players[0].pieces = [track(5), HOME, HOME, HOME]
    return initial
  }

  it('a human with exactly one legal move has it played automatically', async () => {
    const dice = fixedDice([3])
    const { result } = renderHook(() =>
      useGame({ settings: classic2, seats: humans, dice, timing: FAST_TIMING, initial: lonePiece() }),
    )
    expect(result.current.humanToRoll).toBe(true)
    act(() => result.current.roll())
    await waitFor(() => expect(result.current.game.players[0].pieces[0]).toEqual(track(8)))
    expect(result.current.game.turn).toBe('yellow')
  })

  it('auto-plays the single move after timing.botMove', () => {
    vi.useFakeTimers()
    const timing = { botRoll: 0, botMove: 400, step: 0, roll: 0 }
    const dice = fixedDice([3])
    const { result } = renderHook(() => useGame({ settings: classic2, seats: humans, dice, timing, initial: lonePiece() }))
    act(() => result.current.roll())
    expect(result.current.game.pendingRoll).toBe(3)
    act(() => vi.advanceTimersByTime(399))
    expect(result.current.game.players[0].pieces[0]).toEqual(track(5))
    act(() => vi.advanceTimersByTime(1))
    expect(result.current.game.players[0].pieces[0]).toEqual(track(8))
  })

  it('a 6 then another roll from base offers enter, or enter and move on, so the human chooses', () => {
    const dice = fixedDice([6, 3])
    const { result } = renderHook(() => useGame({ settings: classic2, seats: humans, dice, timing: FAST_TIMING }))
    act(() => result.current.roll())
    act(() => result.current.roll())
    expect(result.current.game.pendingRoll).toBe(6)
    expect(result.current.targets).toEqual([
      { kind: 'enter', piece: red0, to: track(0) },
      { kind: 'forward', piece: red0, to: track(3), rolls: 2 },
    ])
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
    expect(result.current.callout).toMatchObject({ title: 'Back kick!', line: 'Red sent Yellow back to base', color: 'red' })
  })

  it('has no callout for a move without a kick, and a fresh one for every kick', () => {
    const initial = createGame(settingsFor('ghana', 2, 'firstWins'))
    initial.players[0].pieces[0] = track(10)
    initial.players[1].pieces[0] = track(7)
    const { result } = renderHook(() =>
      useGame({ settings: initial.settings, seats: humans, dice: fixedDice([3]), timing: FAST_TIMING, initial }),
    )
    act(() => result.current.roll())
    expect(result.current.callout).toBeUndefined()
    act(() => result.current.play(result.current.targets.find((m) => m.kind === 'forward')!))
    expect(result.current.callout).toBeUndefined()
  })

  it('a wasted roll says so and passes the turn', () => {
    const { result } = renderHook(() => useGame({ settings: classic2, seats: humans, dice: fixedDice([3]), timing: FAST_TIMING }))
    act(() => result.current.roll())
    expect(result.current.wasted).toEqual({ color: 'red', value: 3 })
    expect(result.current.game.turn).toBe('yellow')
  })

  it('forgets a wasted roll once the next roll counts', () => {
    const { result } = renderHook(() => useGame({ settings: classic2, seats: humans, dice: fixedDice([3, 6]), timing: FAST_TIMING }))
    act(() => result.current.roll())
    expect(result.current.wasted).toEqual({ color: 'red', value: 3 })
    act(() => result.current.roll())
    expect(result.current.wasted).toBeUndefined()
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
      expect(result.current.targets).toContainEqual({ kind: 'forward', piece: { color: 'red', index: 1 }, to: track(2), rolls: 2 })
      expect(result.current.targets).toHaveLength(4)
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
    expect(result.current.wasted).toEqual({ color: 'red', value: 3 })
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

  describe('effects', () => {
    const strip = (effects: { id: number }[]) => effects.map(({ id: _id, ...effect }) => effect)

    it('emits each roll’s effects once, with growing ids', () => {
      const dice = fixedDice([6, 6, 3])
      const { result, rerender } = renderHook(() => useGame({ settings: classic2, seats: humans, dice, timing: FAST_TIMING }))
      act(() => result.current.roll())
      act(() => result.current.roll())
      rerender()
      expect(strip(result.current.effects)).toEqual([
        { type: 'sixStreak', color: 'red', count: 1 },
        { type: 'sixStreak', color: 'red', count: 2 },
      ])
      act(() => result.current.roll())
      rerender()
      expect(strip(result.current.effects).at(-1)).toEqual({ type: 'streakEnded', color: 'red', count: 2 })
      const ids = result.current.effects.map((e) => e.id)
      expect(ids).toEqual([...ids].sort((a, b) => a - b))
      expect(new Set(ids).size).toBe(ids.length)
    })

    it('emits a move’s effects once, when the piece lands', () => {
      vi.useFakeTimers()
      const initial = createGame(classic2)
      initial.players[0].pieces = [track(5), HOME, HOME, HOME]
      initial.players[1].pieces[0] = track(7)
      const timing = { botRoll: 0, botMove: 0, step: 100, roll: 0 }
      const { result } = renderHook(() => useGame({ settings: classic2, seats: humans, dice: fixedDice([2]), timing, initial }))
      act(() => result.current.roll())
      act(() => vi.advanceTimersByTime(0))
      expect(result.current.moving).toBeDefined()
      expect(result.current.effects).toEqual([])
      for (let i = 0; i < 10; i++) act(() => vi.advanceTimersByTime(100))
      expect(result.current.moving).toBeUndefined()
      expect(strip(result.current.effects)).toEqual([
        { type: 'kick', kind: 'front', at: track(7), kicker: red0, victim: { color: 'yellow', index: 0 } },
      ])
      for (let i = 0; i < 10; i++) act(() => vi.advanceTimersByTime(100))
      expect(result.current.effects).toHaveLength(1)
    })

    it('a listener hears each effect once, however often it re-renders', () => {
      const heard: string[] = []
      const dice = fixedDice([6, 6, 3])
      const { result, rerender } = renderHook(() => {
        const game = useGame({ settings: classic2, seats: humans, dice, timing: FAST_TIMING })
        useEffectStream(game.effects, (e) => heard.push(e.type))
        return game
      })
      act(() => result.current.roll())
      rerender()
      rerender()
      act(() => result.current.roll())
      act(() => result.current.roll())
      rerender()
      expect(heard).toEqual(['sixStreak', 'sixStreak', 'streakEnded'])
    })

    it('plays a sound hook for each effect', () => {
      const played = vi.spyOn(sound, 'playSound')
      const { result } = renderHook(() => useGame({ settings: classic2, seats: humans, dice: fixedDice([6]), timing: FAST_TIMING }))
      act(() => result.current.roll())
      expect(played).toHaveBeenCalledTimes(1)
      expect(played.mock.calls[0][0]).toEqual({ type: 'sixStreak', color: 'red', count: 1 })
      played.mockRestore()
    })

    it('rattles the dice while it spins and clacks when it lands', () => {
      vi.useFakeTimers()
      const played = vi.spyOn(sound, 'playSound')
      const timing = { botRoll: 0, botMove: 10_000, step: 100, roll: 650 }
      const { result } = renderHook(() => useGame({ settings: classic2, seats: humans, dice: fixedDice([3]), timing }))
      act(() => result.current.roll())
      expect(played.mock.calls.map(([e]) => e.type)).toEqual(['roll'])
      act(() => vi.advanceTimersByTime(649))
      expect(played).toHaveBeenCalledTimes(1)
      act(() => vi.advanceTimersByTime(1))
      expect(played.mock.calls.map(([e]) => e.type)).toEqual(['roll', 'diceLanded'])
      played.mockRestore()
    })

    it('ticks each square of a move and clicks on the last; a piece out of its yard pops', () => {
      vi.useFakeTimers()
      const timing = { botRoll: 0, botMove: 10_000, step: 100, roll: 0 }
      const steps = (initial: ReturnType<typeof createGame>, value: number) => {
        const played = vi.spyOn(sound, 'playSound')
        const { result } = renderHook(() => useGame({ settings: classic2, seats: humans, dice: fixedDice([value]), timing, initial }))
        act(() => result.current.roll())
        if (result.current.canStop) act(() => result.current.stop())
        act(() => result.current.play(result.current.targets[0]))
        for (let i = 0; i < 10; i++) act(() => vi.advanceTimersByTime(100))
        const heard = played.mock.calls.map(([e]) => e).filter((e) => e.type === 'pieceStep')
        played.mockRestore()
        return heard.map((e) => sound.soundsFor(e)[0])
      }
      expect(steps(lonePiece(), 3)).toEqual(['step', 'step', 'land'])
      expect(steps(createGame(classic2), 6)).toEqual(['enter'])
    })
  })
})
