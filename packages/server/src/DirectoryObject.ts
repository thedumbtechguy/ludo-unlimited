import type { Listing, ModeName } from '@ludo/engine'
import { DurableObject } from 'cloudflare:workers'
import { browse, pick, staleCodes, type Entry, type Hold, type Listings } from './directory'
import { QUICK_TIMER, quickSettings } from './room'
import type { Env } from './RoomObject'
import { makeCode } from './validate'

const KEY = 'l:'

/** The one directory of open rooms: what rooms say about themselves, the room list, and quick match. */
export class Directory extends DurableObject<Env> {
  private entries?: Listings
  /** Seats held for quick matches; a few seconds each, so not worth storing. */
  private holds: Hold[] = []

  private async load(): Promise<Listings> {
    if (!this.entries) {
      const stored = await this.ctx.storage.list<Entry>({ prefix: KEY })
      this.entries = new Map([...stored].map(([key, entry]) => [key.slice(KEY.length), entry]))
    }
    return this.entries
  }

  /** The listings, less those whose rooms stopped sending. */
  private async fresh(): Promise<Listings> {
    const entries = await this.load()
    const stale = staleCodes(entries, Date.now())
    if (stale.length === 0) return entries
    for (const code of stale) entries.delete(code)
    // Storage deletes at most 128 keys at a time.
    for (let i = 0; i < stale.length; i += 128) await this.ctx.storage.delete(stale.slice(i, i + 128).map((code) => KEY + code))
    return entries
  }

  /** A room's listing, or null to take it off. */
  async put(code: string, listing: Listing | null): Promise<void> {
    const entries = await this.load()
    if (!listing) {
      entries.delete(code)
      await this.ctx.storage.delete(KEY + code)
      return
    }
    const entry: Entry = { listing, at: Date.now() }
    entries.set(code, entry)
    await this.ctx.storage.put(KEY + code, entry)
  }

  async list(): Promise<Listing[]> {
    return browse(await this.fresh())
  }

  /** A quick room for this device, its seat held; undefined when a new one is needed. */
  async quick(o: { device: string; mode: ModeName; skip?: string }): Promise<string | undefined> {
    const picked = pick(await this.fresh(), this.holds, { ...o, now: Date.now() })
    this.holds = picked.holds
    return picked.code
  }

  /**
   * A new quick room with the device on its first seat, unless one turned up meanwhile. It's
   * listed before it's made, so a quick match arriving while it's made joins it rather than
   * making another.
   */
  async make(o: { device: string; name: string; mode: ModeName; skip?: string }): Promise<string | undefined> {
    const found = await this.quick(o)
    if (found) return found
    const entries = await this.load()
    for (let i = 0; i < 5; i++) {
      const code = makeCode(Math.random)
      if (entries.has(code)) continue
      const listing: Listing = { code, kind: 'quick', mode: o.mode, phase: 'lobby', players: 4, humans: 1, seatsFree: 3, computerSeats: [], timer: QUICK_TIMER }
      entries.set(code, { listing, at: Date.now() })
      const room = this.env.ROOMS.get(this.env.ROOMS.idFromName(code))
      let made = false
      try {
        made = await room.create({ code, device: o.device, name: o.name, settings: quickSettings(o.mode), timer: QUICK_TIMER, open: 'quick' })
      } finally {
        // Not made, so not listed: quick matches mustn't be sent there.
        if (!made) entries.delete(code)
      }
      if (made) return code
    }
    return undefined
  }
}
