import type { ClientMessage } from '@ludo/engine'
import { describe, expect, it } from 'vitest'
import { QUICK_REMATCH_MS, QUICK_START_MS } from '../src/room'
import { alarm, join, lobby, playOut, quick, run, say, seatOf, seeded, sentTo, T0 } from './helpers'

const lastRoom = (step: ReturnType<typeof run>, device: string) => sentTo(step, device).filter((m) => m.t === 'room').at(-1)

describe('quick rooms', () => {
  it('have no host, and seat everyone who arrives on the next free seat', () => {
    const step = run(quick(), [join('ama'), join('kofi'), join('esi')])
    expect(step.room.host).toBe('')
    expect(['ama', 'kofi', 'esi'].map((d) => seatOf(step.room, d))).toEqual(['red', 'green', 'yellow'])
    expect(lastRoom(step, 'kofi')).toMatchObject({ you: { host: false, seat: 'green' }, room: { open: 'quick' } })
  })

  it('refuse sitting, standing and every host action', () => {
    const { room } = run(quick(), [join('ama')])
    const msgs: ClientMessage[] = [
      { t: 'sit', color: 'blue' },
      { t: 'stand' },
      { t: 'settings', settings: room.settings, timer: 'off', open: false },
      { t: 'start', empty: 'computers' },
    ]
    for (const msg of msgs) {
      const step = run(room, [say('ama', msg)])
      expect(sentTo(step, 'ama')[0]).toEqual({ t: 'error', code: 'illegal' })
      expect([step.room.phase, seatOf(step.room, 'ama'), step.room.timer]).toEqual(['lobby', 'red', 'normal'])
    }
  })

  it('start 20 s after the first person is seated, computers in the empty seats', () => {
    let step = run(quick(), [join('ama')])
    expect(step.room.startAt).toBe(T0 + QUICK_START_MS)
    expect(step.alarm).toBe(T0 + QUICK_START_MS)
    expect(lastRoom(step, 'ama')).toMatchObject({ room: { startIn: QUICK_START_MS } })
    // Someone else arriving doesn't restart the wait.
    step = run(step.room, [join('kofi')], T0 + 5000)
    expect(step.room.startAt).toBe(T0 + QUICK_START_MS)
    step = alarm(step.room, T0 + QUICK_START_MS)
    expect(step.room.phase).toBe('playing')
    expect(step.room.computers).toEqual(['yellow', 'blue'])
    expect(step.room.startAt).toBeUndefined()
  })

  it('start at once when every seat has someone here', () => {
    const step = run(quick(), [join('ama'), join('b'), join('c'), join('d')])
    expect(step.room.phase).toBe('playing')
    expect(step.room.computers).toEqual([])
  })

  it('with nobody here, stop counting; the next person seated gets a fresh wait', () => {
    let step = run(quick(), [join('ama'), { type: 'disconnect', device: 'ama' }])
    expect(step.room.startAt).toBeUndefined()
    step = run(step.room, [join('kofi')], T0 + 60_000)
    expect(step.room.startAt).toBe(T0 + 60_000 + QUICK_START_MS)
  })

  it('a finished game goes back to the lobby 15 s later, seating whoever is here', () => {
    let room = alarm(run(quick(), [join('ama')]).room, T0 + QUICK_START_MS).room
    room = run(room, [join('kofi')], T0 + QUICK_START_MS).room
    room = playOut(room, (r) => r.phase === 'finished')
    expect(room.phase).toBe('finished')
    expect(room.rematchAt).toBeGreaterThan(T0)
    const at = room.rematchAt!
    const step = alarm(room, at)
    expect(step.room.phase).toBe('lobby')
    expect([seatOf(step.room, 'ama'), seatOf(step.room, 'kofi')]).toEqual(['red', 'green'])
    expect(step.room.startAt).toBe(at + QUICK_START_MS)
    expect(step.room.rematchAt).toBeUndefined()
  })

  it('the clock tells devices when the next game is', () => {
    let room = alarm(run(quick(), [join('ama')]).room, T0 + QUICK_START_MS).room
    let last: ReturnType<typeof alarm> | undefined
    const random = seeded(7)
    for (let i = 0; i < 5000 && room.phase !== 'finished'; i++) {
      last = alarm(room, Math.min(room.botAt ?? Infinity, room.deadline ?? Infinity), random)
      room = last.room
    }
    expect(room.phase).toBe('finished')
    const clock = last!.sends.map((s) => s.msg).find((m) => m.t === 'clock')
    expect(clock).toMatchObject({ t: 'clock', rematchIn: QUICK_REMATCH_MS })
  })
})

describe('hosted open rooms', () => {
  it('are made open, and the host can close and open them in the lobby', () => {
    const made = lobby(4, 'hosted')
    expect(made.open).toBe('hosted')
    let step = run(made, [join('host'), say('host', { t: 'settings', settings: made.settings, timer: 'normal', open: false })])
    expect(step.room.open).toBeUndefined()
    expect(lastRoom(step, 'host')).toMatchObject({ room: { open: undefined } })
    step = run(step.room, [say('host', { t: 'settings', settings: made.settings, timer: 'normal', open: true })])
    expect(step.room.open).toBe('hosted')
  })

  it('refuse settings without a yes or no for open', () => {
    const made = lobby(4)
    const step = run(made, [join('host'), say('host', { t: 'settings', settings: made.settings, timer: 'normal' } as unknown as ClientMessage)])
    expect(sentTo(step, 'host').find((m) => m.t === 'error')).toEqual({ t: 'error', code: 'illegal' })
  })
})
