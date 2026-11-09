import { PROTOCOL_VERSION, type Level, type Settings, type TurnTimer } from '@ludo/engine'

export async function createRoom(body: { device: string; name: string; settings: Settings; timer: TurnTimer; level: Level }): Promise<string> {
  const res = await fetch('/api/rooms', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  if (!res.ok) throw new Error(res.status === 429 ? 'too_fast' : 'failed')
  return ((await res.json()) as { code: string }).code
}

export const socketUrl = (code: string, device: string, name: string): string =>
  `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/rooms/${encodeURIComponent(code)}/socket?${new URLSearchParams({ device, name, v: String(PROTOCOL_VERSION) })}`
