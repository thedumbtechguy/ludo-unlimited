import { PROTOCOL_VERSION, type Listing, type ModeName, type Settings, type TurnTimer } from '@ludo/engine'

export async function createRoom(body: { device: string; name: string; settings: Settings; timer: TurnTimer; open: boolean }): Promise<string> {
  const res = await fetch('/api/rooms', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  if (!res.ok) throw new Error(res.status === 429 ? 'too_fast' : 'failed')
  return ((await res.json()) as { code: string }).code
}

/** A quick room in that mode with a seat for you, other than `skip`. */
export async function quickMatch(body: { device: string; name: string; mode: ModeName; skip?: string }): Promise<string> {
  const res = await fetch('/api/quick', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  if (!res.ok) throw new Error(res.status === 429 ? 'too_fast' : 'failed')
  return ((await res.json()) as { code: string }).code
}

/** The open rooms, freshest first. */
export async function openRooms(): Promise<Listing[]> {
  const res = await fetch('/api/open')
  if (!res.ok) throw new Error('failed')
  return ((await res.json()) as { rooms: Listing[] }).rooms
}

export const socketUrl = (code: string, device: string, name: string): string =>
  `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/rooms/${encodeURIComponent(code)}/socket?${new URLSearchParams({ device, name, v: String(PROTOCOL_VERSION) })}`
