import { describe, expect, it } from 'vitest'
import { viewOf } from '../src/room'
import { join, lobby, run, say, seatOf, sentTo } from './helpers'

describe('lobby', () => {
  it('the creator is the host on the first seat; joining makes a watcher and tells everyone', () => {
    expect(lobby(2).members.map((m) => [m.name, m.connected, m.seat])).toEqual([['Ama', false, 'red']])
    const step = run(lobby(), [join('host', 'Ama'), join('kofi', 'Kofi')])
    expect(step.room.host).toBe('host')
    expect(step.room.members.map((m) => [m.name, m.connected, m.seat])).toEqual([
      ['Ama', true, 'red'],
      ['Kofi', true, undefined],
    ])
    const toHost = sentTo(step, 'host').find((m) => m.t === 'room')
    expect(toHost).toMatchObject({ t: 'room', you: { host: true }, room: { phase: 'lobby' } })
    expect(sentTo(step, 'kofi').find((m) => m.t === 'room')).toMatchObject({ you: { host: false } })
  })

  it('a creator who never connects does not hold the first seat', () => {
    let step = run(lobby(4), [join('kofi', 'Kofi'), say('kofi', { t: 'sit', color: 'red' })])
    expect([seatOf(step.room, 'host'), seatOf(step.room, 'kofi')]).toEqual([undefined, 'red'])
    step = run(lobby(4), [join('kofi', 'Kofi'), say('kofi', { t: 'sit', color: 'green' }), say('kofi', { t: 'start', empty: 'computers' })])
    expect(step.room.computers).toEqual(['red', 'yellow', 'blue'])
    expect(seatOf(step.room, 'host')).toBeUndefined()
  })

  it('start with drop leaves out a seated member who is not connected', () => {
    const step = run(lobby(4), [join('kofi'), join('esi'), say('kofi', { t: 'sit', color: 'green' }), say('esi', { t: 'sit', color: 'blue' }), say('kofi', { t: 'start', empty: 'drop' })])
    expect(step.room.settings.players).toBe(2)
    expect([seatOf(step.room, 'host'), seatOf(step.room, 'kofi'), seatOf(step.room, 'esi')]).toEqual([undefined, 'red', 'yellow'])
  })

  it('the room view never carries device IDs', () => {
    const { room } = run(lobby(), [join('host')])
    expect(JSON.stringify(viewOf(room, room.lastActive))).not.toContain('"device"')
  })

  it('sits on a free seat of the player count, and stands', () => {
    let step = run(lobby(2), [join('host'), join('kofi'), say('host', { t: 'sit', color: 'red' })])
    expect(seatOf(step.room, 'host')).toBe('red')
    step = run(step.room, [say('kofi', { t: 'sit', color: 'red' })])
    expect(sentTo(step, 'kofi')[0]).toEqual({ t: 'error', code: 'illegal' })
    step = run(step.room, [say('kofi', { t: 'sit', color: 'green' })]) // green is not a 2-player seat
    expect(seatOf(step.room, 'kofi')).toBeUndefined()
    step = run(step.room, [say('kofi', { t: 'sit', color: 'yellow' }), say('host', { t: 'stand' })])
    expect([seatOf(step.room, 'host'), seatOf(step.room, 'kofi')]).toEqual([undefined, 'yellow'])
  })

  it('only the host changes settings; fewer players stands anyone on a seat that is gone', () => {
    let step = run(lobby(4), [join('host'), join('kofi'), say('kofi', { t: 'sit', color: 'blue' })])
    const two = { ...step.room.settings, players: 2 as const }
    step = run(step.room, [say('kofi', { t: 'settings', settings: two, timer: 'quick' })])
    expect(step.room.settings.players).toBe(4)
    step = run(step.room, [say('host', { t: 'settings', settings: two, timer: 'quick' })])
    expect(step.room.settings.players).toBe(2)
    expect(step.room.timer).toBe('quick')
    expect(seatOf(step.room, 'kofi')).toBeUndefined()
  })

  it('settings are stored without extra keys', () => {
    const step = run(lobby(4), [join('host')])
    const settings = { ...step.room.settings, junk: 1, rules: { ...step.room.settings.rules, extra: true } }
    const { room } = run(step.room, [say('host', { t: 'settings', settings, timer: 'quick' })])
    expect(room.settings).toEqual(lobby(4).settings)
  })

  it('a watcher who leaves the lobby is forgotten', () => {
    const { room } = run(lobby(), [join('host'), join('kofi'), { type: 'disconnect', device: 'kofi' }])
    expect(room.members.map((m) => m.device)).toEqual(['host'])
  })

  it('a disconnect in the lobby frees the seat; the host role passes on', () => {
    const step = run(lobby(), [
      join('host'),
      join('kofi'),
      join('esi'),
      say('host', { t: 'sit', color: 'red' }),
      say('esi', { t: 'sit', color: 'blue' }),
      { type: 'disconnect', device: 'host' },
    ])
    expect(seatOf(step.room, 'host')).toBeUndefined()
    expect(step.room.host).toBe('esi') // seated before watchers
  })

  it('start with computers fills the empty seats', () => {
    const step = run(lobby(4), [join('host'), say('host', { t: 'sit', color: 'green' }), say('host', { t: 'start', empty: 'computers' })])
    expect(step.room.phase).toBe('playing')
    expect(step.room.computers).toEqual(['red', 'yellow', 'blue'])
  })

  it('start with drop plays with who is there, on the seats of the smaller count', () => {
    const step = run(lobby(4), [
      join('host'),
      join('kofi'),
      join('esi'),
      say('host', { t: 'sit', color: 'red' }),
      say('kofi', { t: 'sit', color: 'green' }),
      say('esi', { t: 'sit', color: 'blue' }),
      say('host', { t: 'start', empty: 'drop' }),
    ])
    expect(step.room.settings.players).toBe(3)
    expect([seatOf(step.room, 'host'), seatOf(step.room, 'kofi'), seatOf(step.room, 'esi')]).toEqual(['red', 'green', 'yellow'])
    expect(step.room.computers).toEqual([])
  })

  it('refuses a start that is not possible, or not from the host', () => {
    let step = run(lobby(4), [join('host'), join('kofi'), say('host', { t: 'sit', color: 'red' }), say('host', { t: 'start', empty: 'drop' })])
    expect(step.room.phase).toBe('lobby')
    step = run(step.room, [say('kofi', { t: 'start', empty: 'computers' })])
    expect(step.room.phase).toBe('lobby')
    expect(sentTo(step, 'kofi')[0]).toEqual({ t: 'error', code: 'illegal' })
  })

  it('renames, and refuses an empty name', () => {
    let step = run(lobby(), [join('host'), say('host', { t: 'rename', name: '  Ama B ' })])
    expect(step.room.members[0].name).toBe('Ama B')
    step = run(step.room, [say('host', { t: 'rename', name: '   ' })])
    expect(step.room.members[0].name).toBe('Ama B')
  })

  it('sync sends the full room to the asker only', () => {
    const step = run(run(lobby(), [join('host'), join('kofi')]).room, [say('kofi', { t: 'sync' })])
    expect(step.sends).toHaveLength(1)
    expect(step.sends[0]).toMatchObject({ to: 'kofi', msg: { t: 'room' } })
  })
})
