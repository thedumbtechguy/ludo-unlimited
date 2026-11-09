import { settingsFor } from '@ludo/engine'
import { describe, expect, it } from 'vitest'
import { DAY, LISTING_REFRESH_MS, QUICK_START_MS } from '../src/room'
import { alarm, join, lobby, quick, run, say, T0 } from './helpers'

describe('listings', () => {
  it('a hosted lobby is listed with its host and free seats', () => {
    expect(run(lobby(4, 'hosted'), [join('host', 'Ama')]).listing).toEqual({
      code: 'KQZM',
      kind: 'hosted',
      mode: 'ghana',
      phase: 'lobby',
      players: 4,
      humans: 1,
      seatsFree: 3,
      computerSeats: [],
      timer: 'normal',
      host: 'Ama',
    })
  })

  it('a private room is never listed', () => {
    expect(run(lobby(4), [join('host'), join('kofi')]).listing).toBeUndefined()
  })

  it('is sent only when it changes, and again every 10 minutes', () => {
    const first = run(lobby(4, 'hosted'), [join('host', 'Ama')])
    const same = run(first.room, [say('host', { t: 'rename', name: 'Ama' })], T0 + 1000)
    expect(same.listing).toBeUndefined()
    expect(same.alarm).toBeLessThanOrEqual(T0 + LISTING_REFRESH_MS)
    expect(alarm(same.room, T0 + LISTING_REFRESH_MS).listing).toMatchObject({ code: 'KQZM' })
  })

  it('a quick game with computer seats lists them; a full one is taken off', () => {
    const started = alarm(run(quick(), [join('ama')]).room, T0 + QUICK_START_MS)
    expect(started.listing).toMatchObject({ kind: 'quick', mode: 'classic', phase: 'playing', humans: 1, seatsFree: 0, computerSeats: ['green', 'yellow', 'blue'] })
    // Listed while filling, taken off as the last seat starts the game.
    expect(run(quick(), [join('ama'), join('b'), join('c'), join('d')]).listing).toBeNull()
    const filled = run(started.room, [join('b'), join('c'), join('d')], T0 + QUICK_START_MS)
    expect(filled.listing).toBeNull()
  })

  it('rules chosen one by one are custom', () => {
    const custom = settingsFor('ghana', 4, 'firstWins')
    custom.rules.labourer = false
    const step = run(lobby(4, 'hosted'), [join('host', 'Ama'), say('host', { t: 'settings', settings: custom, timer: 'normal', open: true })])
    expect(step.listing).toMatchObject({ mode: 'custom' })
  })

  it('closing a room takes it off; an expired listed room is taken off as it goes', () => {
    const listed = run(lobby(4, 'hosted'), [join('host', 'Ama')])
    const closed = run(listed.room, [say('host', { t: 'settings', settings: listed.room.settings, timer: 'normal', open: false })])
    expect(closed.listing).toBeNull()
    const expired = alarm(listed.room, T0 + DAY)
    expect([expired.remove, expired.listing]).toEqual([true, null])
  })
})
