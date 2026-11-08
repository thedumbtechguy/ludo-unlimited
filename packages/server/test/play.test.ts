import { ANIMATION_TIMING, settingsFor, TIMER_SECONDS } from '@ludo/engine'
import { describe, expect, it } from 'vitest'
import { DAY, gameOf, reduce, type Room } from '../src/room'
import { die, fixedRandom, join, lobby, run, say, sentTo, T0 } from './helpers'

/** Ama (red) and Kofi (yellow) in a 2-player classic room, started at T0. */
function started(timer: Room['timer'] = 'normal'): Room {
  const room = lobby(2)
  room.settings = settingsFor('classic', 2, 'firstWins')
  room.timer = timer
  return run(room, [
    join('host', 'Ama'),
    join('kofi', 'Kofi'),
    say('host', { t: 'sit', color: 'red' }),
    say('kofi', { t: 'sit', color: 'yellow' }),
    say('host', { t: 'start', empty: 'computers' }),
  ]).room
}
const alarm = (room: Room, at: number, random = fixedRandom([die(3)])) => reduce(room, { type: 'alarm' }, at, random)

describe('playing', () => {
  it('the human with the turn has the clock', () => {
    const room = started()
    expect(room.deadline).toBe(T0 + TIMER_SECONDS.normal * 1000)
    expect(room.botAt).toBeUndefined()
  })

  it('a roll is the room’s dice, sent to everyone with a sequence number, then the clock', () => {
    const step = run(started(), [say('host', { t: 'roll' })], T0 + 10, fixedRandom([die(3)]))
    expect(step.room.log).toEqual([{ type: 'roll', value: 3 }])
    expect(sentTo(step, 'kofi')).toContainEqual({ t: 'event', seq: 1, event: { type: 'roll', value: 3 }, by: 'human' })
    expect(sentTo(step, 'kofi').at(-1)).toMatchObject({ t: 'clock', paused: false })
  })

  it('refuses a roll out of turn, and a move that is not legal', () => {
    let step = run(started(), [say('kofi', { t: 'roll' })])
    expect(sentTo(step, 'kofi')[0]).toEqual({ t: 'error', code: 'not_your_turn' })
    step = run(started(), [say('host', { t: 'move', move: { kind: 'enter', piece: { color: 'red', index: 0 }, to: { kind: 'track', index: 0 } } })])
    expect(sentTo(step, 'host')[0]).toEqual({ t: 'error', code: 'illegal' })
  })

  it('a timeout makes the computer play that one decision; the human keeps the seat', () => {
    const room = started()
    const step = alarm(room, room.deadline!)
    expect(step.room.log).toEqual([{ type: 'roll', value: 3 }])
    expect(sentTo(step, 'host')).toContainEqual({ t: 'event', seq: 1, event: { type: 'roll', value: 3 }, by: 'computer' })
    expect(step.room.covering).toEqual([])
  })

  it('the clock waits for the animation: the next deadline is after the dice settle', () => {
    const step = run(started(), [say('host', { t: 'roll' })], T0, fixedRandom([die(3)]))
    // A 3 with everyone in base passes the turn to Kofi, whose clock starts once the dice settle.
    expect(gameOf(step.room).turn).toBe('yellow')
    expect(step.room.deadline).toBe(T0 + ANIMATION_TIMING.roll + TIMER_SECONDS.normal * 1000)
  })

  it('computer seats play by themselves, paced', () => {
    const room = run(lobby(2), [join('host'), say('host', { t: 'sit', color: 'yellow' }), say('host', { t: 'start', empty: 'computers' })]).room
    expect(room.computers).toEqual(['red'])
    expect(room.botAt).toBe(T0 + ANIMATION_TIMING.botRoll)
    expect(alarm(room, room.botAt!).room.log).toHaveLength(1)
  })

  it('no timer: a human is never timed out', () => {
    expect(started('off').deadline).toBeUndefined()
  })

  it('a disconnect is covered at once; the player gets the seat back at their next turn', () => {
    let room = started()
    room = run(room, [{ type: 'disconnect', device: 'host' }], T0 + 5).room
    expect(room.covering).toEqual(['red'])
    expect(room.botAt).toBe(T0 + 5 + ANIMATION_TIMING.botRoll)
    room = run(room, [join('host', 'Ama')], T0 + 6).room
    expect(room.covering).toEqual(['red']) // the computer finishes the decision it has
    room = alarm(room, room.botAt!).room // computer rolls a 3 for red: turn passes to Kofi
    room = run(room, [say('kofi', { t: 'roll' })], room.lastActive + 1000, fixedRandom([die(3)])).room // Kofi's 3 passes back to red
    expect(room.covering).toEqual([])
    expect(room.deadline).toBeDefined()
  })

  it('a disconnect off-turn leaves the clock of the player who has it alone', () => {
    const room = run(started(), [{ type: 'disconnect', device: 'kofi' }], T0 + 5).room
    expect(room.covering).toEqual(['yellow'])
    expect(room.deadline).toBe(T0 + TIMER_SECONDS.normal * 1000)
  })

  it('rejoining a seat in a room nobody seated is in restarts the clock', () => {
    let room = run(started(), [join('esi', 'Esi'), { type: 'disconnect', device: 'kofi' }, { type: 'disconnect', device: 'host' }]).room
    expect(room.botAt).toBeUndefined()
    room = run(room, [say('esi', { t: 'rejoin', color: 'red' })], T0 + 50).room
    // It's the start of red's turn, so Esi plays it herself; Kofi is still covered.
    expect([room.covering, room.deadline]).toEqual([['yellow'], T0 + 50 + TIMER_SECONDS.normal * 1000])
  })

  it('pause stops every clock; resume restarts it from now', () => {
    let room = run(started(), [say('host', { t: 'pause' })], T0 + 100).room
    expect([room.paused, room.deadline, room.botAt]).toEqual([true, undefined, undefined])
    expect(run(room, [say('host', { t: 'roll' })]).room.log).toEqual([])
    room = run(room, [say('host', { t: 'resume' })], T0 + 5000).room
    expect(room.deadline).toBe(T0 + 5000 + TIMER_SECONDS.normal * 1000)
  })

  it('pausing for a player ends when they come back', () => {
    let room = run(started(), [{ type: 'disconnect', device: 'kofi' }, say('host', { t: 'pause', for: 'yellow' })]).room
    expect(room.pausedFor).toBe('yellow')
    room = run(room, [join('kofi', 'Kofi')], T0 + 10).room
    expect(room.paused).toBe(false)
  })

  it('with nobody seated connected, no clock runs', () => {
    const room = run(started(), [{ type: 'disconnect', device: 'kofi' }, { type: 'disconnect', device: 'host' }]).room
    expect([room.deadline, room.botAt]).toEqual([undefined, undefined])
    expect(run(room, [join('kofi', 'Kofi')], T0 + 50).room.botAt).toBeDefined() // red (covered) acts again
  })

  it('reactions: seated only, one per 3 seconds', () => {
    let step = run(started(), [say('host', { t: 'react', id: 'fire' })], T0)
    expect(sentTo(step, 'kofi')).toContainEqual({ t: 'reaction', color: 'red', id: 'fire' })
    step = run(step.room, [say('host', { t: 'react', id: 'clap' })], T0 + 1000)
    expect(sentTo(step, 'host')[0]).toEqual({ t: 'error', code: 'too_fast' })
    step = run(step.room, [say('host', { t: 'react', id: 'clap' })], T0 + 3000)
    expect(sentTo(step, 'kofi')).toContainEqual({ t: 'reaction', color: 'red', id: 'clap' })
  })

  it('rematch takes everyone back to the lobby with the same settings', () => {
    const room: Room = { ...started(), phase: 'finished', deadline: undefined }
    const step = run(room, [say('host', { t: 'rematch' })])
    expect(step.room.phase).toBe('lobby')
    expect(step.room.log).toEqual([])
    expect(step.room.members.map((m) => m.seat)).toEqual(['red', 'yellow'])
  })

  it('a room is removed a day after its last activity', () => {
    const room = started()
    expect(alarm(room, room.lastActive + DAY).remove).toBe(true)
  })
})
