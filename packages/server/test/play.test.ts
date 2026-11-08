import { ANIMATION_TIMING, applyMove, chooseMove, roll, settingsFor, TIMER_SECONDS, type ClientMessage } from '@ludo/engine'
import { describe, expect, it } from 'vitest'
import { DAY, gameOf, reduce, type Room } from '../src/room'
import { die, fixedRandom, join, lobby, run, say, seatOf, sentTo, T0 } from './helpers'

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

/** A repeatable stream of random values. */
const seeded = (seed: number) => () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31)

/** Let the alarms play (computers and timeouts) until `done`. */
function playOut(room: Room, done: (room: Room) => boolean, random = seeded(7)): Room {
  for (let i = 0; i < 5000 && !done(room); i++) room = alarm(room, Math.min(room.botAt ?? Infinity, room.deadline ?? Infinity), random).room
  return room
}

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

  it('a disconnect is covered at once; back at the start of their turn, the player takes it', () => {
    let room = run(started(), [{ type: 'disconnect', device: 'host' }], T0 + 5).room
    expect(room.covering).toEqual(['red'])
    expect(room.botAt).toBe(T0 + 5 + ANIMATION_TIMING.botRoll)
    room = run(room, [join('host', 'Ama')], T0 + 6).room
    expect(room.covering).toEqual([])
    expect([room.botAt, room.deadline]).toEqual([undefined, T0 + 6 + TIMER_SECONDS.normal * 1000])
  })

  it('a turn the computer has begun for a covered player, it finishes; the player takes the next one', () => {
    let room = run(started(), [{ type: 'disconnect', device: 'host' }], T0 + 5).room
    room = alarm(room, room.botAt!, fixedRandom([die(6)])).room // red rolls a 6 and rolls again
    room = run(room, [join('host', 'Ama')], T0 + 700).room
    expect(room.covering).toEqual(['red'])
    expect(room.botAt).toBeDefined()
    while (gameOf(room).turn === 'red') room = alarm(room, room.botAt!).room // the computer plays the rest of red's turn
    expect(room.covering).toEqual(['red'])
    room = run(room, [say('kofi', { t: 'roll' })], room.lastActive + 5000, fixedRandom([die(3)])).room // Kofi's 3 passes back to red
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

  it('pause and resume are for the host only; a pause for a colour not in the game is a plain pause', () => {
    let step = run(started(), [say('kofi', { t: 'pause' })])
    expect([step.room.paused, sentTo(step, 'kofi')[0]]).toEqual([false, { t: 'error', code: 'illegal' }])
    step = run(step.room, [say('host', { t: 'pause', for: 'green' })])
    expect([step.room.paused, step.room.pausedFor]).toEqual([true, undefined])
    step = run(step.room, [say('kofi', { t: 'resume' })])
    expect([step.room.paused, sentTo(step, 'kofi')[0]]).toEqual([true, { t: 'error', code: 'illegal' }])
  })

  it('rejoin takes only a game seat whose player has gone', () => {
    let room = run(started(), [join('esi', 'Esi'), { type: 'disconnect', device: 'kofi' }, say('host', { t: 'pause', for: 'yellow' })]).room
    for (const msg of [{ t: 'rejoin' } as unknown as ClientMessage, { t: 'rejoin', color: 'green' } as const, { t: 'rejoin', color: 'red' } as const]) {
      const step = run(room, [say('esi', msg)])
      expect(sentTo(step, 'esi')[0]).toEqual({ t: 'error', code: 'illegal' })
      expect([step.room.paused, step.room.host, seatOf(step.room, 'esi')]).toEqual([true, 'host', undefined])
    }
    room = run(room, [say('esi', { t: 'rejoin', color: 'yellow' })]).room
    expect([room.paused, seatOf(room, 'esi')]).toEqual([false, 'yellow'])
    expect(room.members.map((m) => m.name)).toEqual(['Ama', 'Esi']) // Kofi has no seat now, so he is forgotten
  })

  it('rejoin is refused in the lobby', () => {
    const step = run(lobby(2), [join('host'), join('kofi'), say('host', { t: 'sit', color: 'red' }), say('kofi', { t: 'rejoin', color: 'red' })])
    expect(sentTo(step, 'kofi')[0]).toEqual({ t: 'error', code: 'illegal' })
    expect(seatOf(step.room, 'kofi')).toBeUndefined()
  })

  it('the host role passes on during a game, to the seated player', () => {
    let room = run(started(), [join('esi', 'Esi'), { type: 'disconnect', device: 'host' }]).room
    expect(room.host).toBe('kofi')
    room = run(room, [join('host', 'Ama'), say('kofi', { t: 'pause' })]).room
    expect([room.host, room.paused]).toEqual(['kofi', true])
  })

  it('watchers who leave are forgotten; seated players are kept for rejoining', () => {
    const room = run(started(), [join('esi', 'Esi'), { type: 'disconnect', device: 'esi' }, { type: 'disconnect', device: 'kofi' }]).room
    expect(room.members.map((m) => [m.name, m.connected])).toEqual([
      ['Ama', true],
      ['Kofi', false],
    ])
  })

  it('a disconnect while the dice are still settling leaves the computer the animation time', () => {
    let room = run(started(), [say('host', { t: 'roll' })], T0, fixedRandom([die(6)])).room // a 6: red rolls again
    expect(room.readyAt).toBe(T0 + ANIMATION_TIMING.roll)
    room = run(room, [{ type: 'disconnect', device: 'host' }], T0 + 100).room
    expect(room.botAt).toBe(T0 + ANIMATION_TIMING.roll + ANIMATION_TIMING.botRoll)
  })

  it('resume waits for an event still being shown', () => {
    let room = run(started(), [say('host', { t: 'roll' })], T0, fixedRandom([die(6)])).room
    room = run(room, [say('host', { t: 'pause' }), say('host', { t: 'resume' })], T0 + 100).room
    expect(room.deadline).toBe(T0 + ANIMATION_TIMING.roll + TIMER_SECONDS.normal * 1000)
  })

  it('the clock never sends a negative time left', () => {
    const step = run(started(), [{ type: 'disconnect', device: 'kofi' }], T0 + TIMER_SECONDS.normal * 1000 + 5000)
    expect(sentTo(step, 'host').find((m) => m.t === 'clock')).toMatchObject({ deadlineIn: 0 })
  })

  it('a computer seat moves a piece', () => {
    let room = lobby(2)
    room.settings = settingsFor('classic', 2, 'firstWins')
    room = run(room, [join('host'), say('host', { t: 'sit', color: 'yellow' }), say('host', { t: 'start', empty: 'computers' })]).room
    room = alarm(room, room.botAt!, fixedRandom([die(6)])).room
    room = alarm(room, room.botAt!, fixedRandom([die(3)])).room
    expect(gameOf(room).pendingRoll).toBe(6)
    const at = room.botAt!
    expect(at).toBe(room.readyAt! + ANIMATION_TIMING.botMove)
    const step = alarm(room, at)
    expect(sentTo(step, 'host')).toContainEqual({
      t: 'event',
      seq: 3,
      event: { type: 'move', move: expect.objectContaining({ kind: 'enter', piece: { color: 'red', index: expect.any(Number) } }) },
      by: 'computer',
    })
  })

  it('a game played to the end finishes the room, and its clocks stop', () => {
    const room = playOut(started(), (r) => r.phase !== 'playing')
    expect(room.phase).toBe('finished')
    expect(gameOf(room).status).toBe('finished')
    expect([room.deadline, room.botAt]).toEqual([undefined, undefined])
    const step = alarm(room, room.lastActive + 60_000)
    expect([step.room.log.length, step.sends, step.alarm]).toEqual([room.log.length, [], room.lastActive + DAY])
  })

  it('a covered player who finishes is no longer covered', () => {
    let room = lobby(4)
    room.settings = settingsFor('classic', 4, 'playForPlaces')
    room = run(room, [
      join('host', 'Ama'),
      join('kofi'),
      join('esi'),
      join('yaw'),
      say('host', { t: 'sit', color: 'red' }),
      say('kofi', { t: 'sit', color: 'green' }),
      say('esi', { t: 'sit', color: 'yellow' }),
      say('yaw', { t: 'sit', color: 'blue' }),
      say('host', { t: 'start', empty: 'computers' }),
      { type: 'disconnect', device: 'kofi' },
      { type: 'disconnect', device: 'esi' },
      { type: 'disconnect', device: 'yaw' },
    ]).room
    expect(room.covering).toEqual(['green', 'yellow', 'blue'])
    // Play the game in the engine up to a covered player's finishing move (replaying every step
    // through the room is slow), then let the room make that move.
    const random = seeded(7)
    let game = gameOf(room)
    const before = (g: typeof game) => g.players.every((p) => p.color === 'red' || p.finishedPlace === undefined)
    while (before(game)) game = game.pendingRoll === undefined ? roll(game, 1 + Math.floor(random() * 6)) : applyMove(game, chooseMove(game, random)!)
    const log = game.log.slice(0, -1)
    room = { ...room, log, seq: log.length, deadline: undefined, botAt: room.lastActive }
    const finished = (r: Room) => gameOf(r).players.filter((p) => p.color !== 'red' && p.finishedPlace !== undefined)
    expect(finished(room)).toEqual([])
    room = playOut(room, (r) => finished(r).length > 0, random)
    expect(room.phase).toBe('playing')
    expect(room.covering).not.toContain(finished(room)[0].color)
    expect(room.covering).toHaveLength(2)
  })

  it('rematch takes everyone back to the lobby with the same settings', () => {
    const room: Room = { ...started(), phase: 'finished', deadline: undefined }
    const step = run(room, [say('host', { t: 'rematch' })])
    expect(step.room.phase).toBe('lobby')
    expect(step.room.log).toEqual([])
    expect(step.room.members.map((m) => m.seat)).toEqual(['red', 'yellow'])
  })

  it('rematch frees the seats of players who left', () => {
    const left = run(started(), [{ type: 'disconnect', device: 'kofi' }]).room
    const step = run({ ...left, phase: 'finished', deadline: undefined, botAt: undefined }, [say('host', { t: 'rematch' })])
    expect(step.room.members.map((m) => [m.name, m.seat])).toEqual([['Ama', 'red']])
    expect(step.room.covering).toEqual([])
  })

  it('a room is removed a day after its last activity', () => {
    const room = started()
    expect(alarm(room, room.lastActive + DAY).remove).toBe(true)
  })
})
