import { PROTOCOL_VERSION, type RoomInfo, type Settings, type TurnTimer } from '@ludo/engine'

export async function createRoom(body: { device: string; name: string; settings: Settings; timer: TurnTimer }): Promise<string> {
  const res = await fetch('/api/rooms', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  if (!res.ok) throw new Error(res.status === 429 ? 'too_fast' : 'failed')
  return ((await res.json()) as { code: string }).code
}

/** The room, or undefined when there's no room with that code. */
export async function roomInfo(code: string): Promise<RoomInfo | undefined> {
  const res = await fetch(`/api/rooms/${encodeURIComponent(code)}`)
  if (res.status === 404) return undefined
  if (!res.ok) throw new Error('failed')
  return (await res.json()) as RoomInfo
}

export const socketUrl = (code: string, device: string, name: string): string =>
  `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/rooms/${encodeURIComponent(code)}/socket?${new URLSearchParams({ device, name, v: String(PROTOCOL_VERSION) })}`
