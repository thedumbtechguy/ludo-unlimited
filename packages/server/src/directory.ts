import type { Listing, ModeName } from '@ludo/engine'

export const STALE_MS = 30 * 60_000
export const HOLD_MS = 10_000
export const MAX_LISTED = 50

export type Entry = { listing: Listing; at: number }
/** A seat kept for a device that quick match just sent to a room. */
export type Hold = { code: string; device: string; until: number }
export type Listings = Map<string, Entry>

/** Listings not heard about for 30 minutes: their rooms went without saying so. */
export const staleCodes = (entries: Listings, now: number): string[] =>
  [...entries].filter(([, e]) => now - e.at >= STALE_MS).map(([code]) => code)

/** What people browse: the most recently updated first. */
export const browse = (entries: Listings): Listing[] =>
  [...entries.values()].sort((a, b) => b.at - a.at).slice(0, MAX_LISTED).map((e) => e.listing)

/** Holds on this room for devices now seated there: its listing counts their seats already. */
export const unhold = (holds: Hold[], code: string, seated: string[]): Hold[] =>
  holds.filter((h) => h.code !== code || !seated.includes(h.device))

/** Lobbies before games, fuller ones first. */
const rank = ({ listing }: Entry) => (listing.phase === 'lobby' ? 10 : 0) + listing.humans

/**
 * The quick room in this mode to send a device to, holding it a seat for a few seconds so two
 * quick matches can't both get the last one. No code when a new room is needed.
 */
export function pick(entries: Listings, holds: Hold[], o: { device: string; mode: ModeName; skip?: string; now: number }): { code?: string; holds: Hold[] } {
  const live = holds.filter((h) => h.until > o.now && h.device !== o.device)
  const seats = ({ listing }: Entry) =>
    (listing.phase === 'lobby' ? listing.seatsFree : listing.computerSeats.length) - live.filter((h) => h.code === listing.code).length
  const best = [...entries.values()]
    .filter((e) => e.listing.kind === 'quick' && e.listing.mode === o.mode && e.listing.code !== o.skip && o.now - e.at < STALE_MS && seats(e) > 0)
    .sort((a, b) => rank(b) - rank(a) || b.at - a.at)[0]
  if (!best) return { holds: live }
  return { code: best.listing.code, holds: [...live, { code: best.listing.code, device: o.device, until: o.now + HOLD_MS }] }
}
