import { createGame, replay, settingsFor, type ClientMessage, type GameEvent, type RoomView, type ServerMessage } from '@ludo/engine'
import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FAST_TIMING } from '../useGame'
import { useOnlineGame } from './useOnlineGame'

const settings = settingsFor('classic', 2, 'firstWins')
/** A room whose game is `log` played out (the room sends its game, not the log). */
const roomView = ({ log = [], ...over }: Partial<RoomView> & { log?: GameEvent[] } = {}): RoomView => ({
  code: 'KQZM',
  phase: 'playing',
  host: 1,
  settings,
  timer: 'normal',
  level: 'normal',
  members: [
    { id: 1, name: 'Ama', connected: true, seat: 'red' },
    { id: 2, name: 'Kofi', connected: true, seat: 'yellow' },
  ],
  computers: [],
  covering: [],
  paused: false,
  game: replay(over.settings ?? settings, log),
  seq: 0,
  ...over,
})

function setup(name = 'Ama') {
  let deliver: (msg: ServerMessage) => void = () => {}
  const send = vi.fn((_msg: ClientMessage) => true)
  const close = vi.fn()
  let url: () => string = () => ''
  const connect = vi.fn((o: { url: () => string; onMessage: (m: ServerMessage) => void; onStatus: (s: 'open') => void }) => {
    deliver = o.onMessage
    url = o.url
    o.onStatus('open')
    return { send, close }
  })
  const hook = renderHook((p: { name: string }) => useOnlineGame({ code: 'KQZM', device: 'd1', name: p.name, timing: FAST_TIMING, connect }), {
    initialProps: { name },
  })
  const push = (msg: ServerMessage) => act(() => deliver(msg))
  return { ...hook, push, send, close, connect, url: () => url() }
}

const ama = { id: 1, seat: 'red' as const, host: true }

describe('useOnlineGame', () => {
  afterEach(() => vi.useRealTimers())

  it('builds the board from the room and lets you act on your seat', () => {
    const { result, push, send } = setup()
    push({ t: 'room', room: roomView(), you: ama })
    expect(result.current.humanToRoll).toBe(true)
    act(() => result.current.roll())
    expect(send).toHaveBeenCalledWith({ t: 'roll' })
    expect(result.current.humanToRoll).toBe(false) // waiting for the room to answer
  })

  it('an answer from the room ends the wait', () => {
    const { result, push } = setup()
    push({ t: 'room', room: roomView(), you: ama })
    act(() => result.current.roll())
    push({ t: 'error', code: 'too_fast' })
    expect(result.current.humanToRoll).toBe(true)
    act(() => result.current.roll())
    push({ t: 'room', room: roomView(), you: ama })
    expect(result.current.humanToRoll).toBe(true)
  })

  it('plays events in sequence, and asks for a sync on a gap', () => {
    const { result, push, send } = setup()
    push({ t: 'room', room: roomView(), you: ama })
    push({ t: 'event', seq: 1, event: { type: 'roll', value: 3 }, by: 'human' })
    expect(result.current.game.log).toEqual([{ type: 'roll', value: 3 }])
    push({ t: 'event', seq: 3, event: { type: 'roll', value: 2 }, by: 'computer' })
    expect(send).toHaveBeenCalledWith({ t: 'sync' })
    expect(result.current.game.log).toHaveLength(1)
  })

  it('counts from the room seq, not the log length', () => {
    const { result, push, send } = setup()
    // After a rematch the log starts over but seq keeps counting.
    push({ t: 'room', room: roomView({ seq: 7 }), you: ama })
    push({ t: 'event', seq: 8, event: { type: 'roll', value: 3 }, by: 'human' })
    expect(result.current.game.log).toEqual([{ type: 'roll', value: 3 }])
    expect(send).not.toHaveBeenCalledWith({ t: 'sync' })
  })

  it('asks for one sync at a time, until the room answers', () => {
    const { push, send } = setup()
    push({ t: 'room', room: roomView(), you: ama })
    push({ t: 'event', seq: 3, event: { type: 'roll', value: 2 }, by: 'computer' })
    push({ t: 'event', seq: 4, event: { type: 'roll', value: 2 }, by: 'computer' })
    expect(send.mock.calls.filter(([m]) => m.t === 'sync')).toHaveLength(1)
    push({ t: 'room', room: roomView({ seq: 4, log: [{ type: 'roll', value: 3 }] }), you: ama })
    push({ t: 'event', seq: 6, event: { type: 'roll', value: 2 }, by: 'computer' })
    expect(send.mock.calls.filter(([m]) => m.t === 'sync')).toHaveLength(2)
  })

  it('builds the board from the first room even at seq 0', () => {
    const { result, push } = setup()
    push({ t: 'room', room: roomView(), you: ama })
    expect(result.current.game.players.map((p) => p.color)).toEqual(['red', 'yellow'])
  })

  it('rebuilds the board when the game starts, though seq has not moved', () => {
    const { result, push } = setup()
    push({ t: 'room', room: roomView({ phase: 'lobby', settings: settingsFor('classic', 4, 'firstWins') }), you: ama })
    expect(result.current.game.players).toHaveLength(4)
    // Started with empty seats dropped: two players.
    push({ t: 'room', room: roomView(), you: ama })
    expect(result.current.game.players.map((p) => p.color)).toEqual(['red', 'yellow'])
  })

  it('reconnects with the latest name', () => {
    const { rerender, url, connect } = setup()
    expect(url()).toContain('name=Ama')
    rerender({ name: 'Kofi' })
    expect(url()).toContain('name=Kofi')
    expect(connect).toHaveBeenCalledTimes(1)
  })

  it('a room starts the board from its game, without replaying a log', () => {
    const { result, push } = setup()
    // A game no log here would lead to: the room's word is final, whatever the rules on this device.
    const game = { ...createGame(settings), turn: 'yellow' as const, queuedRolls: [6] }
    push({ t: 'room', room: roomView({ game, seq: 5 }), you: ama })
    expect(result.current.game).toEqual(game)
  })

  it('a resync rebuilds the board from the room', () => {
    const { result, push } = setup()
    const log = [{ type: 'roll' as const, value: 3 }]
    push({ t: 'room', room: roomView({ log, seq: 1 }), you: { id: 2, seat: 'yellow', host: false } })
    expect(result.current.game.log).toEqual(log)
    expect(result.current.game.turn).toBe('yellow')
  })

  it('a room at the seq already shown leaves the board alone', () => {
    const { result, push } = setup()
    push({ t: 'room', room: roomView(), you: ama })
    push({ t: 'event', seq: 1, event: { type: 'roll', value: 3 }, by: 'human' })
    // A member change: same seq, so no reset (the log here is only a marker).
    push({ t: 'room', room: roomView({ seq: 1, covering: ['yellow'] }), you: ama })
    expect(result.current.game.log).toHaveLength(1)
    expect(result.current.clock.covering).toEqual(['yellow'])
  })

  it('your covered seat is not yours to play until the room says so', () => {
    const { result, push } = setup()
    push({ t: 'room', room: roomView({ covering: ['red'] }), you: ama })
    expect(result.current.humanToRoll).toBe(false)
    push({ t: 'clock', paused: false, covering: [] })
    expect(result.current.humanToRoll).toBe(true)
  })

  it('a paused game is not yours to play', () => {
    const { result, push } = setup()
    push({ t: 'room', room: roomView({ paused: true }), you: ama })
    expect(result.current.humanToRoll).toBe(false)
  })

  it('the clock sets a local deadline', () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(1_000_000)
    const { result, push } = setup()
    push({ t: 'clock', deadlineIn: 30_000, paused: false, covering: [] })
    expect(result.current.clock.deadline).toBe(1_030_000)
    push({ t: 'clock', paused: true, pausedFor: 'red', covering: [] })
    expect(result.current.clock).toEqual({ deadline: undefined, paused: true, pausedFor: 'red', covering: [] })
  })

  it('shows a reaction for 2 s', () => {
    vi.useFakeTimers()
    const { result, push } = setup()
    push({ t: 'reaction', color: 'red', id: 'fire' })
    expect(result.current.reactions).toEqual([{ id: 1, color: 'red', reaction: 'fire' }])
    act(() => vi.advanceTimersByTime(1999))
    expect(result.current.reactions).toHaveLength(1)
    act(() => vi.advanceTimersByTime(1))
    expect(result.current.reactions).toEqual([])
  })

  it.each(['old_version', 'not_found', 'replaced', 'broken'] as const)('stops for good on %s', (code) => {
    const { result, push, close } = setup()
    push({ t: 'error', code })
    expect(result.current.error).toBe(code)
    expect(close).toHaveBeenCalled()
  })

  it('keeps going after other errors', () => {
    const { result, push, close } = setup()
    push({ t: 'error', code: 'illegal' })
    expect(result.current.error).toBeUndefined()
    expect(close).not.toHaveBeenCalled()
  })

  it('a watcher controls nothing', () => {
    const { result, push } = setup()
    push({ t: 'room', room: roomView(), you: { id: 3, host: false } })
    expect(result.current.watching).toBe(true)
    expect(result.current.humanToRoll).toBe(false)
  })

  it('a lobby room keeps a fresh board with its settings', () => {
    const { result, push } = setup()
    // A game was under way; the room went back to the lobby (a rematch) with a 3-player setting.
    push({ t: 'room', room: roomView({ log: [{ type: 'roll', value: 3 }], seq: 1 }), you: { id: 1, seat: 'red', host: true } })
    push({ t: 'room', room: roomView({ phase: 'lobby', settings: settingsFor('ghana', 3, 'firstWins'), seq: 1 }), you: { id: 1, host: true } })
    expect(result.current.game.log).toEqual([])
    expect(result.current.game.players.map((p) => p.color)).toEqual(createGame(settingsFor('ghana', 3, 'firstWins')).players.map((p) => p.color))
  })

  describe('a board that fails', () => {
    // A move the board can't play: not one of the legal moves.
    const badMove = { t: 'event' as const, seq: 1, event: { type: 'move' as const, move: { kind: 'enter' as const, piece: { color: 'red' as const, index: 0 }, to: { kind: 'track' as const, index: 40 } } as never }, by: 'human' as const }
    const quiet = () => vi.spyOn(console, 'error').mockImplementation(() => {})

    it('asks for the room once and carries on from it', () => {
      const error = quiet()
      const { result, push, send, close } = setup()
      push({ t: 'room', room: roomView(), you: ama })
      push(badMove)
      expect(send.mock.calls.filter(([m]) => m.t === 'sync')).toHaveLength(1)
      expect(error).toHaveBeenCalled()
      // The room's game is fine: the board starts over from it, even at a seq it had seen.
      push({ t: 'room', room: roomView({ log: [{ type: 'roll', value: 3 }], seq: 1 }), you: ama })
      expect(result.current.game.log).toEqual([{ type: 'roll', value: 3 }])
      expect(result.current.error).toBeUndefined()
      expect(close).not.toHaveBeenCalled()
      error.mockRestore()
    })

    it('says the room is broken when the room’s game fails too', () => {
      const error = quiet()
      const { result, push, close } = setup()
      push({ t: 'room', room: roomView(), you: ama })
      push(badMove)
      // A game this device can't make sense of.
      push({ t: 'room', room: roomView({ game: { ...createGame(settings), players: [], pendingRoll: 6 }, seq: 1 }), you: ama })
      expect(result.current.error).toBe('broken')
      expect(close).toHaveBeenCalled()
      error.mockRestore()
    })

    it('a room game that fails from the start gets one sync, then gives up', () => {
      const error = quiet()
      const { result, push, send } = setup()
      const broken = roomView({ game: { ...createGame(settings), players: [], pendingRoll: 6 }, seq: 2 })
      push({ t: 'room', room: broken, you: ama })
      expect(send).toHaveBeenCalledWith({ t: 'sync' })
      expect(result.current.error).toBeUndefined()
      push({ t: 'room', room: broken, you: ama })
      expect(result.current.error).toBe('broken')
      error.mockRestore()
    })
  })
})

