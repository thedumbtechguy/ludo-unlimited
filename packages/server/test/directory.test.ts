import type { Listing } from '@ludo/engine'
import { describe, expect, it } from 'vitest'
import { browse, HOLD_MS, pick, STALE_MS, staleCodes, type Entry } from '../src/directory'

const NOW = 5_000_000
const listing = (code: string, over: Partial<Listing> = {}): Listing => ({
  code,
  kind: 'quick',
  mode: 'ghana',
  phase: 'lobby',
  players: 4,
  humans: 1,
  seatsFree: 3,
  computerSeats: [],
  timer: 'normal',
  ...over,
})
const entries = (...list: [Listing, number?][]) => new Map<string, Entry>(list.map(([l, at = NOW]) => [l.code, { listing: l, at }]))

describe('directory', () => {
  it('finds listings not heard about for 30 minutes', () => {
    expect(staleCodes(entries([listing('AAAA'), NOW - STALE_MS], [listing('BBBB'), NOW - STALE_MS + 1]), NOW)).toEqual(['AAAA'])
  })

  it('lists the most recently updated first, at most 50', () => {
    const many = entries(...Array.from({ length: 60 }, (_, i): [Listing, number] => [listing(`R${String(i).padStart(3, '0')}`), NOW - i]))
    const shown = browse(many)
    expect(shown).toHaveLength(50)
    expect(shown[0].code).toBe('R000')
  })

  it('picks a quick lobby of the mode, fuller first, before a game with a computer seat', () => {
    const all = entries(
      [listing('GAME', { phase: 'playing', seatsFree: 0, computerSeats: ['blue'], humans: 3 })],
      [listing('ONE', { humans: 1, seatsFree: 3 })],
      [listing('TWO', { humans: 2, seatsFree: 2 })],
      [listing('CLSC', { mode: 'classic', humans: 3, seatsFree: 1 })],
      [listing('HOST', { kind: 'hosted', humans: 3, seatsFree: 1 })],
    )
    expect(pick(all, [], { device: 'd', mode: 'ghana', now: NOW }).code).toBe('TWO')
    expect(pick(entries([listing('GAME', { phase: 'playing', seatsFree: 0, computerSeats: ['blue'] })]), [], { device: 'd', mode: 'ghana', now: NOW }).code).toBe('GAME')
    expect(pick(all, [], { device: 'd', mode: 'ghana', skip: 'TWO', now: NOW }).code).toBe('ONE')
  })

  it('holds the seat for 10 s, so the last seat goes to one device only', () => {
    const last = entries([listing('LAST', { humans: 3, seatsFree: 1 })])
    const first = pick(last, [], { device: 'a', mode: 'ghana', now: NOW })
    expect(first).toEqual({ code: 'LAST', holds: [{ code: 'LAST', device: 'a', until: NOW + HOLD_MS }] })
    expect(pick(last, first.holds, { device: 'b', mode: 'ghana', now: NOW + 1 }).code).toBeUndefined()
    // The device itself can ask again, and the hold runs out.
    expect(pick(last, first.holds, { device: 'a', mode: 'ghana', now: NOW + 1 }).code).toBe('LAST')
    const later = pick(last, first.holds, { device: 'b', mode: 'ghana', now: NOW + HOLD_MS })
    expect(later.code).toBe('LAST')
    expect(later.holds).toEqual([{ code: 'LAST', device: 'b', until: NOW + 2 * HOLD_MS }])
  })

  it('never picks a stale listing', () => {
    expect(pick(entries([listing('OLD'), NOW - STALE_MS]), [], { device: 'd', mode: 'ghana', now: NOW }).code).toBeUndefined()
  })
})
