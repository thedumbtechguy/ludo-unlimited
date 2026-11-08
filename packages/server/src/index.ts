import type { Env } from './RoomObject'
import { cleanName, makeCode, validSettings, validTimer } from './validate'

export { RoomObject } from './RoomObject'

const json = (body: unknown, status = 200) => Response.json(body, { status })

/** /api/rooms (create), /api/rooms/:code (look up), /api/rooms/:code/socket (play). Everything else is static assets. */
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const [api, rooms, rawCode, socket] = new URL(request.url).pathname.split('/').filter(Boolean)
    if (api !== 'api' || rooms !== 'rooms') return json({ error: 'not_found' }, 404)
    if (!rawCode) return request.method === 'POST' ? create(request, env) : json({ error: 'not_found' }, 404)
    const code = rawCode.toUpperCase()
    if (!/^[A-Z]{4}$/.test(code)) return json({ error: 'not_found' }, 404)
    const room = env.ROOMS.get(env.ROOMS.idFromName(code))
    if (socket === 'socket' && request.headers.get('Upgrade') === 'websocket') return room.fetch(request)
    if (!socket && request.method === 'GET') {
      const info = await room.info()
      return info ? json(info) : json({ error: 'not_found' }, 404)
    }
    return json({ error: 'not_found' }, 404)
  },
} satisfies ExportedHandler<Env>

async function create(request: Request, env: Env): Promise<Response> {
  const ip = request.headers.get('CF-Connecting-IP') ?? 'local'
  if (!(await env.CREATE_LIMIT.limit({ key: ip })).success) return json({ error: 'too_fast' }, 429)
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
  const device = body?.device
  const name = cleanName(body?.name)
  if (typeof device !== 'string' || !device || device.length > 64 || !name || !validSettings(body?.settings) || !validTimer(body?.timer)) {
    return json({ error: 'bad_request' }, 400)
  }
  // A clash with a live room is rare (23^4 codes); try a few times.
  for (let i = 0; i < 5; i++) {
    const code = makeCode(Math.random)
    if (await env.ROOMS.get(env.ROOMS.idFromName(code)).create({ code, device, name, settings: body.settings, timer: body.timer })) {
      return json({ code })
    }
  }
  return json({ error: 'busy' }, 503)
}
