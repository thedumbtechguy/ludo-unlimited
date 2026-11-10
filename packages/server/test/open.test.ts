import { eventMs, type ClientMessage, type Openness } from '@ludo/engine'
import { describe, expect, it } from 'vitest'
import { QUICK_REMATCH_MS, QUICK_START_MS, SEAT_RELEASE_MS } from '../src/room'
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
      { t: 'settings', settings: room.settings, timer: 'off', level: 'normal', open: false },
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

  it('a player who leaves the lobby gives up their seat at once', () => {
    let step = run(quick(), [join('ama'), join('kofi'), { type: 'disconnect', device: 'kofi' }])
    expect(seatOf(step.room, 'kofi')).toBeUndefined()
    step = run(step.room, [join('esi')])
    expect(seatOf(step.room, 'esi')).toBe('green')
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

  it('the clock tells devices when the next game is, counting from when they have shown the last move', () => {
    let room = alarm(run(quick(), [join('ama')]).room, T0 + QUICK_START_MS).room
    let last: ReturnType<typeof alarm> | undefined
    let before = room
    const random = seeded(7)
    for (let i = 0; i < 5000 && room.phase !== 'finished'; i++) {
      before = room
      last = alarm(room, Math.min(room.botAt ?? Infinity, room.deadline ?? Infinity), random)
      room = last.room
    }
    expect(room.phase).toBe('finished')
    const shown = eventMs(before.game!, room.log.at(-1)!)
    expect(shown).toBeGreaterThan(0)
    const clock = last!.sends.map((s) => s.msg).find((m) => m.t === 'clock')
    expect(clock).toMatchObject({ t: 'clock', rematchIn: shown + QUICK_REMATCH_MS })
  })
})

describe('hosted open rooms', () => {
  it('are made open, and the host can close and open them in the lobby', () => {
    const made = lobby(4, 'hosted')
    expect(made.open).toBe('hosted')
    let step = run(made, [join('host'), say('host', { t: 'settings', settings: made.settings, timer: 'normal', level: 'normal', open: false })])
    expect(step.room.open).toBeUndefined()
    expect(lastRoom(step, 'host')).toMatchObject({ room: { open: undefined } })
    step = run(step.room, [say('host', { t: 'settings', settings: made.settings, timer: 'normal', level: 'normal', open: true })])
    expect(step.room.open).toBe('hosted')
  })

  it('refuse settings without a yes or no for open', () => {
    const made = lobby(4)
    const step = run(made, [join('host'), say('host', { t: 'settings', settings: made.settings, timer: 'normal' } as unknown as ClientMessage)])
    expect(sentTo(step, 'host').find((m) => m.t === 'error')).toEqual({ t: 'error', code: 'illegal' })
  })
})

describe('left seats in open rooms', () => {
  /** Ama (host, red) and Kofi (yellow) playing a 2-player room, private unless `open`. */
  const playing = (open?: Openness) =>
    run(lobby(2, open), [join('host', 'Ama'), join('kofi', 'Kofi'), say('kofi', { t: 'sit', color: 'yellow' }), say('host', { t: 'start', empty: 'computers' })]).room
  const gone = (room = playing('hosted')) => run(room, [{ type: 'disconnect', device: 'kofi' }])

  it('away 120 s, the seat goes to the computer and anyone can take it', () => {
    let step = gone()
    expect(step.room.covering).toContain('yellow')
    expect(step.alarm).toBeLessThanOrEqual(T0 + SEAT_RELEASE_MS)
    step = alarm(step.room, T0 + SEAT_RELEASE_MS)
    expect(step.room.computers).toEqual(['yellow'])
    expect(step.room.covering).not.toContain('yellow')
    expect(step.room.leftSeats).toEqual({ yellow: 'kofi' })
    expect(seatOf(step.room, 'kofi')).toBeUndefined()
    step = run(step.room, [join('esi'), say('esi', { t: 'takeover', color: 'yellow' })], T0 + SEAT_RELEASE_MS)
    expect(seatOf(step.room, 'esi')).toBe('yellow')
  })

  it('back while the computer still has it, the seat is theirs again', () => {
    const released = alarm(gone().room, T0 + SEAT_RELEASE_MS).room
    const step = run(released, [join('kofi', 'Kofi')], T0 + SEAT_RELEASE_MS + 1000)
    expect(seatOf(step.room, 'kofi')).toBe('yellow')
    expect(step.room.computers).toEqual([])
  })

  it('back after someone else took it, they watch', () => {
    const released = alarm(gone().room, T0 + SEAT_RELEASE_MS).room
    const taken = run(released, [join('esi'), say('esi', { t: 'takeover', color: 'yellow' })], T0 + SEAT_RELEASE_MS).room
    const step = run(taken, [join('kofi', 'Kofi')], T0 + SEAT_RELEASE_MS + 1000)
    expect(seatOf(step.room, 'kofi')).toBeUndefined()
    expect(seatOf(step.room, 'esi')).toBe('yellow')
  })

  it('back after leaving two seats, they get the one still free', () => {
    // Ama red, Kofi green, computers on yellow and blue.
    let room = run(lobby(4, 'hosted'), [join('host', 'Ama'), join('kofi', 'Kofi'), say('kofi', { t: 'sit', color: 'green' }), say('host', { t: 'start', empty: 'computers' })]).room
    room = alarm(run(room, [{ type: 'disconnect', device: 'kofi' }]).room, T0 + SEAT_RELEASE_MS).room
    room = run(room, [join('esi'), say('esi', { t: 'takeover', color: 'green' })], T0 + SEAT_RELEASE_MS).room
    // Kofi comes back to watch, takes yellow from the computer, and leaves again.
    room = run(room, [join('kofi', 'Kofi'), say('kofi', { t: 'takeover', color: 'yellow' }), { type: 'disconnect', device: 'kofi' }], T0 + SEAT_RELEASE_MS).room
    room = alarm(room, T0 + 2 * SEAT_RELEASE_MS).room
    expect(room.leftSeats).toEqual({ green: 'kofi', yellow: 'kofi' })
    const step = run(room, [join('kofi', 'Kofi')], T0 + 2 * SEAT_RELEASE_MS)
    expect(seatOf(step.room, 'kofi')).toBe('yellow')
    expect(seatOf(step.room, 'esi')).toBe('green')
  })

  it('a player who has finished keeps their seat', () => {
    const room = playing('hosted')
    const game = room.game!
    room.game = { ...game, players: game.players.map((p) => (p.color === 'yellow' ? { ...p, finishedPlace: 1 } : p)) }
    const left = gone(room).room
    expect(left.members.find((m) => m.device === 'kofi')?.leftAt).toBeUndefined()
    const step = alarm(left, T0 + SEAT_RELEASE_MS)
    expect(step.room.computers).toEqual([])
    expect(seatOf(step.room, 'kofi')).toBe('yellow')
  })

  it('back in time, nothing is given away', () => {
    const back = run(gone().room, [join('kofi', 'Kofi')], T0 + 60_000).room
    const step = alarm(back, T0 + SEAT_RELEASE_MS)
    expect(step.room.computers).toEqual([])
    expect(seatOf(step.room, 'kofi')).toBe('yellow')
  })

  it('private rooms keep the seat for its player', () => {
    const step = alarm(gone(playing(undefined)).room, T0 + SEAT_RELEASE_MS)
    expect(step.room.computers).toEqual([])
    expect(seatOf(step.room, 'kofi')).toBe('yellow')
  })

  it('quick rooms seat a newcomer on a computer seat', () => {
    const room = alarm(run(quick(), [join('ama')]).room, T0 + QUICK_START_MS).room
    const step = run(room, [join('kofi')], T0 + QUICK_START_MS)
    expect(seatOf(step.room, 'kofi')).toBe('green')
    expect(step.room.computers).toEqual(['yellow', 'blue'])
  })

  it('a rematch forgets left seats and pending releases', () => {
    const released = alarm(gone().room, T0 + SEAT_RELEASE_MS).room
    const left = run(released, [join('esi'), say('esi', { t: 'takeover', color: 'yellow' }), { type: 'disconnect', device: 'esi' }], T0 + SEAT_RELEASE_MS).room
    expect(left.members.find((m) => m.device === 'esi')?.leftAt).toBe(T0 + SEAT_RELEASE_MS)
    const step = run({ ...left, phase: 'finished', deadline: undefined, botAt: undefined }, [say('host', { t: 'rematch' })], T0 + SEAT_RELEASE_MS)
    expect(step.room.leftSeats).toBeUndefined()
    expect(step.room.members.every((m) => m.leftAt === undefined)).toBe(true)
  })
})
