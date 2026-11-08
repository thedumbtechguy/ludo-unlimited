import { createGame, settingsFor, type RoomView, type ServerMessage } from '@ludo/engine'
import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FAST_TIMING } from '../useGame'
import { useOnlineGame } from './useOnlineGame'

const settings = settingsFor('classic', 2, 'firstWins')
const roomView = (over: Partial<RoomView> = {}): RoomView => ({
  code: 'KQZM',
  phase: 'playing',
  host: 1,
  settings,
  timer: 'normal',
  members: [
    { id: 1, name: 'Ama', connected: true, seat: 'red' },
    { id: 2, name: 'Kofi', connected: true, seat: 'yellow' },
  ],
  computers: [],
  covering: [],
  paused: false,
  log: [],
  seq: 0,
  ...over,
})

function setup() {
  let deliver: (msg: ServerMessage) => void = () => {}
  const send = vi.fn(() => true)
  const close = vi.fn()
  const connect = vi.fn((o: { onMessage: (m: ServerMessage) => void; onStatus: (s: 'open') => void }) => {
    deliver = o.onMessage
    o.onStatus('open')
    return { send, close }
  })
  const hook = renderHook(() => useOnlineGame({ code: 'KQZM', device: 'd1', name: 'Ama', timing: FAST_TIMING, connect }))
  const push = (msg: ServerMessage) => act(() => deliver(msg))
  return { ...hook, push, send, close }
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

  it('a resync rebuilds the board from the log', () => {
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

  it.each(['old_version', 'not_found', 'replaced'] as const)('stops for good on %s', (code) => {
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
    push({ t: 'room', room: roomView({ phase: 'lobby', settings: settingsFor('ghana', 4, 'firstWins') }), you: { id: 1, host: true } })
    expect(result.current.game.players).toHaveLength(createGame(settingsFor('ghana', 4, 'firstWins')).players.length)
  })
})
