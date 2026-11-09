import { ANIMATION_TIMING, applyMove, chooseMove, createGame, replay, roll, settingsFor, TIMER_SECONDS, type ClientMessage, type GameEvent } from '@ludo/engine'
import { describe, expect, it } from 'vitest'
import { DAY, gameOf, recover, type Room } from '../src/room'
import { alarm, die, fixedRandom, join, lobby, playOut, run, say, seatOf, seeded, sentTo, T0 } from './helpers'

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

/** A move no game here allows: red has nothing to enter with. */
const ILLEGAL: GameEvent = { type: 'move', move: { kind: 'enter', piece: { color: 'red', index: 0 }, to: { kind: 'track', index: 40 } } }

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

  it('a computer decision the engine refuses stops the clocks instead of retrying', () => {
    const room = run(lobby(2), [join('host'), say('host', { t: 'sit', color: 'yellow' }), say('host', { t: 'start', empty: 'computers' })]).room
    const step = alarm(room, room.botAt!, () => 1) // a die of 7
    expect([step.room.log, step.room.botAt, step.room.deadline]).toEqual([[], undefined, undefined])
    expect(step.alarm).toBe(step.room.lastActive + DAY)
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
    expect(step.sends).toEqual([{ to: 'host', msg: { t: 'error', code: 'too_fast' } }])
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

  it('the host role passes on during a game, to the seated player, and back to the creator', () => {
    let room = run(started(), [join('esi', 'Esi'), { type: 'disconnect', device: 'host' }]).room
    expect(room.host).toBe('kofi')
    room = run(room, [say('kofi', { t: 'pause' })]).room
    expect([room.host, room.paused]).toEqual(['kofi', true])
    expect(run(room, [join('host', 'Ama')]).room.host).toBe('host') // the creator takes it back
  })

  it('watchers who leave are forgotten; seated players are kept for coming back', () => {
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

  it('a long game played through the room stays fast, and matches a fresh replay', () => {
    const t = performance.now()
    const room = playOut(started(), (r) => r.phase !== 'playing', seeded(11))
    expect(performance.now() - t).toBeLessThan(300) // replaying every input took over a second
    expect(room.log.length).toBeGreaterThan(200)
    expect(gameOf(structuredClone(room))).toEqual(replay(room.settings, room.log))
    expect(gameOf(room).status).toBe('finished')
  })

  it('rooms that share a code never get each other’s game', () => {
    const three = run(started(), [say('host', { t: 'roll' })], T0, fixedRandom([die(3)])).room
    const six = run(started(), [say('host', { t: 'roll' })], T0, fixedRandom([die(6)])).room
    expect([three.code, three.seq, three.log.length]).toEqual([six.code, six.seq, six.log.length])
    expect(gameOf(three).turn).toBe('yellow')
    expect(gameOf(six).turn).toBe('red')
    expect(gameOf(three).turn).toBe('yellow')
  })

  it('keeps the game itself, from the start, through every event, and sends it to devices', () => {
    const room = started()
    expect(room.game).toEqual(createGame(room.settings))
    const step = run(room, [say('host', { t: 'roll' })], T0 + 10, fixedRandom([die(3)]))
    expect(step.room.game).toEqual(replay(room.settings, [{ type: 'roll', value: 3 }]))
    const sync = run(step.room, [say('kofi', { t: 'sync' })])
    expect(sentTo(sync, 'kofi')[0]).toMatchObject({ t: 'room', room: { game: step.room.game, seq: 1 } })
  })

  it('plays on from its game, never replaying the log', () => {
    // A log the rules no longer allow: the room doesn't look at it.
    const room: Room = { ...started(), log: [ILLEGAL] }
    const step = run(room, [say('host', { t: 'roll' })], T0 + 10, fixedRandom([die(3)]))
    expect(step.room.seq).toBe(1)
    expect(gameOf(step.room).turn).toBe('yellow')
  })

  it('rematch forgets the game; the next start begins a fresh one', () => {
    const played = run(started(), [say('host', { t: 'roll' })], T0 + 10, fixedRandom([die(3)])).room
    const lobby = run({ ...played, phase: 'finished', deadline: undefined }, [say('host', { t: 'rematch' })]).room
    expect(lobby.game).toBeUndefined()
    expect(gameOf(lobby)).toEqual(createGame(lobby.settings))
    const again = run(lobby, [say('host', { t: 'start', empty: 'computers' })]).room
    expect(again.game).toEqual(createGame(again.settings))
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
    room = { ...room, log, game: replay(room.settings, log), seq: log.length, deadline: undefined, botAt: room.lastActive }
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

/** Ama (red) against the computer (yellow) in a 2-player classic room, with Esi watching. */
function withComputer(): Room {
  const room = lobby(2)
  room.settings = settingsFor('classic', 2, 'firstWins')
  return run(room, [join('host', 'Ama'), say('host', { t: 'sit', color: 'red' }), say('host', { t: 'start', empty: 'computers' }), join('esi', 'Esi')]).room
}
/** Ama rolls a 3, which passes the turn to yellow. */
const amaPasses = (room: Room, at = room.lastActive + 10) => run(room, [say('host', { t: 'roll' })], at, fixedRandom([die(3)])).room

describe('taking over a computer seat', () => {
  it('a watcher takes it off turn and plays its next turn', () => {
    let room = run(withComputer(), [say('esi', { t: 'takeover', color: 'yellow' })], T0 + 5).room
    expect([room.computers, room.covering, seatOf(room, 'esi')]).toEqual([[], ['yellow'], 'yellow'])
    expect(room.deadline).toBe(T0 + TIMER_SECONDS.normal * 1000) // Ama's clock is left alone
    room = amaPasses(room)
    expect(gameOf(room).turn).toBe('yellow')
    expect([room.covering, room.botAt, room.deadline !== undefined]).toEqual([[], undefined, true])
    room = run(room, [say('esi', { t: 'roll' })], room.lastActive + 5000, fixedRandom([die(3)])).room
    expect(room.log.at(-1)).toEqual({ type: 'roll', value: 3 })
  })

  it('taken just as its turn starts, the watcher plays that turn', () => {
    let room = amaPasses(withComputer())
    expect(room.botAt).toBeDefined()
    room = run(room, [say('esi', { t: 'takeover', color: 'yellow' })], room.lastActive + 5).room
    expect([room.covering, room.botAt, room.deadline !== undefined]).toEqual([[], undefined, true])
  })

  it('taken mid-turn, the computer finishes the turn first', () => {
    let room = amaPasses(withComputer())
    room = alarm(room, room.botAt!, fixedRandom([die(6)])).room // yellow rolls a 6
    room = run(room, [say('esi', { t: 'takeover', color: 'yellow' })], room.lastActive + 5).room
    expect([room.covering, room.botAt !== undefined]).toEqual([['yellow'], true])
    expect(sentTo(run(room, [say('esi', { t: 'move', move: chooseMove(gameOf(room), () => 0)! })]), 'esi')[0]).toEqual({ t: 'error', code: 'not_your_turn' })
    while (gameOf(room).turn === 'yellow') room = alarm(room, room.botAt!).room
    expect(room.covering).toEqual(['yellow'])
    room = amaPasses(room, room.lastActive + 5000)
    expect([room.covering, room.botAt, room.deadline !== undefined]).toEqual([[], undefined, true])
  })

  it('a seat taken over is the player’s own: covered while they are gone, theirs when they are back', () => {
    let room = run(withComputer(), [say('esi', { t: 'takeover', color: 'yellow' }), join('yaw', 'Yaw')]).room
    room = amaPasses(room)
    room = run(room, [{ type: 'disconnect', device: 'esi' }], room.lastActive + 5).room
    expect([room.covering, seatOf(room, 'esi')]).toEqual([['yellow'], 'yellow'])
    const step = run(room, [say('yaw', { t: 'takeover', color: 'yellow' })])
    expect(sentTo(step, 'yaw')[0]).toEqual({ t: 'error', code: 'illegal' })
    room = run(room, [join('esi', 'Esi')], room.lastActive + 10).room
    expect([room.covering, room.botAt, room.deadline !== undefined]).toEqual([[], undefined, true])
  })

  it('in a room nobody seated is in, taking a seat restarts the clock', () => {
    let room = run(withComputer(), [{ type: 'disconnect', device: 'host' }]).room
    expect([room.covering, room.botAt]).toEqual([['red'], undefined])
    room = run(room, [say('esi', { t: 'takeover', color: 'yellow' })], T0 + 50).room
    // Red (covered) acts; yellow is Esi's from its next turn.
    expect([room.covering, room.botAt]).toEqual([['red', 'yellow'], T0 + 50 + ANIMATION_TIMING.botRoll])
  })

  it('refused for a seat whose player left, for a seated player, for a colour the computer doesn’t play, and in the lobby', () => {
    const left = run(started(), [join('esi', 'Esi'), { type: 'disconnect', device: 'kofi' }]).room
    const refused = (room: Room, device: string, msg: ClientMessage) => {
      const step = run(room, [say(device, msg)])
      expect(sentTo(step, device)[0]).toEqual({ t: 'error', code: 'illegal' })
      return step.room
    }
    expect(seatOf(refused(left, 'esi', { t: 'takeover', color: 'yellow' }), 'esi')).toBeUndefined()
    const computer = withComputer()
    expect(refused(computer, 'host', { t: 'takeover', color: 'yellow' }).computers).toEqual(['yellow'])
    expect(seatOf(refused(computer, 'esi', { t: 'takeover', color: 'red' }), 'esi')).toBeUndefined()
    expect(seatOf(refused(computer, 'esi', { t: 'takeover', color: 'green' }), 'esi')).toBeUndefined()
    const inLobby = run(lobby(2), [join('host'), join('kofi'), say('host', { t: 'sit', color: 'red' })]).room
    expect(seatOf(refused(inLobby, 'kofi', { t: 'takeover', color: 'yellow' }), 'kofi')).toBeUndefined()
  })

  it('the old rejoin message is refused', () => {
    const left = run(started(), [join('esi', 'Esi'), { type: 'disconnect', device: 'kofi' }]).room
    const step = run(left, [say('esi', { t: 'rejoin', color: 'yellow' } as unknown as ClientMessage)])
    expect(sentTo(step, 'esi')[0]).toEqual({ t: 'error', code: 'illegal' })
    expect([seatOf(step.room, 'esi'), seatOf(step.room, 'kofi')]).toEqual([undefined, 'yellow'])
  })

  it('a watcher who took a seat is kept when they leave; a rematch keeps them on it', () => {
    let room = run(withComputer(), [say('esi', { t: 'takeover', color: 'yellow' }), { type: 'disconnect', device: 'esi' }]).room
    expect(room.members.map((m) => [m.name, m.seat])).toEqual([['Ama', 'red'], ['Esi', 'yellow']])
    room = run(room, [join('esi', 'Esi')]).room
    room = run({ ...room, phase: 'finished', deadline: undefined, botAt: undefined }, [say('host', { t: 'rematch' })]).room
    expect(room.members.map((m) => m.seat)).toEqual(['red', 'yellow'])
  })
})


describe('recovering a room stored without its game', () => {
  const stored = (room: Room): Room => ({ ...room, game: undefined })

  it('replays the log once to get its game', () => {
    const room = run(started(), [say('host', { t: 'roll' })], T0 + 10, fixedRandom([die(3)])).room
    const recovered = recover(stored(room), T0 + 20)
    expect(recovered).toEqual(room)
  })

  it('leaves a lobby alone', () => {
    const room = lobby()
    expect(recover(room, T0)).toBe(room)
  })

  it('stops at the first event that no longer plays, and goes on from there', () => {
    const room = run(started(), [say('host', { t: 'roll' })], T0 + 10, fixedRandom([die(3)])).room
    const roll3 = { type: 'roll', value: 3 } as const
    // A move the rules (now) refuse, between plays that were fine.
    const bad: Room = { ...stored(room), log: [roll3, ILLEGAL, roll3], seq: 3, deadline: undefined }
    const recovered = recover(bad, T0 + 50)
    expect(recovered.log).toEqual([roll3])
    expect(recovered.game).toEqual(replay(room.settings, [roll3]))
    // seq moves on, so every device starts over from the room.
    expect(recovered.seq).toBe(4)
    expect(recovered.phase).toBe('playing')
    // Yellow (a human) has the turn and the clock.
    expect(recovered.deadline).toBe(T0 + 50 + TIMER_SECONDS.normal * 1000)
    // And the room plays on.
    const step = run(recovered, [say('kofi', { t: 'roll' })], T0 + 60, fixedRandom([die(3)]))
    expect(step.room.seq).toBe(5)
    expect(step.room.log).toHaveLength(2)
  })

  it('a finished game cut short is playing again', () => {
    const room = run(started(), [say('host', { t: 'roll' })], T0 + 10, fixedRandom([die(3)])).room
    const bad: Room = { ...stored(room), phase: 'finished' as const, log: [ILLEGAL] }
    const recovered = recover(bad, T0 + 50)
    expect([recovered.phase, recovered.log, recovered.game]).toEqual(['playing', [], createGame(room.settings)])
  })
})
