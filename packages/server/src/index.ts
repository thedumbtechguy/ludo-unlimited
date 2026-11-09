import type { Env } from './RoomObject'
import { cleanName, makeCode, validCode, validDevice, validMode, validSettings, validTimer } from './validate'

export { Directory } from './DirectoryObject'
export { RoomObject } from './RoomObject'

const MAX_BODY = 4096

const json = (body: unknown, status = 200) => Response.json(body, { status })
const notFound = () => json({ error: 'not_found' }, 404)
const directory = (env: Env) => env.DIRECTORY.get(env.DIRECTORY.idFromName('open'))

/** /api/rooms (create), /api/rooms/:code (look up), /api/rooms/:code/socket (play), /api/open (the list), /api/quick (quick match). Everything else is static assets. */
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const [api, what, rawCode, socket] = new URL(request.url).pathname.split('/').filter(Boolean)
    if (api !== 'api') return notFound()
    if (what === 'open' && !rawCode && request.method === 'GET') return listOpen(env)
    if (what === 'quick' && !rawCode && request.method === 'POST') return quick(request, env)
    if (what !== 'rooms') return notFound()
    if (!rawCode) return request.method === 'POST' ? create(request, env) : notFound()
    const code = rawCode.toUpperCase()
    if (!validCode(code)) return notFound()
    const room = env.ROOMS.get(env.ROOMS.idFromName(code))
    if (socket === 'socket' && request.headers.get('Upgrade') === 'websocket') return room.fetch(request)
    if (!socket && request.method === 'GET') {
      const info = await room.info()
      return info ? json(info) : notFound()
    }
    return notFound()
  },
} satisfies ExportedHandler<Env>

/** The body as an object, or null when it's too big or not JSON. */
async function readBody(request: Request): Promise<Record<string, unknown> | null> {
  if (Number(request.headers.get('Content-Length')) > MAX_BODY) return null
  const text = await request.text()
  if (text.length > MAX_BODY) return null
  try {
    const body = JSON.parse(text)
    return typeof body === 'object' && body !== null ? body : null
  } catch {
    return null
  }
}

/** Making rooms: 3 a minute per address. */
const allowed = async (request: Request, env: Env) =>
  (await env.CREATE_LIMIT.limit({ key: request.headers.get('CF-Connecting-IP') ?? 'local' })).success

async function create(request: Request, env: Env): Promise<Response> {
  if (!(await allowed(request, env))) return json({ error: 'too_fast' }, 429)
  const body = await readBody(request)
  const name = cleanName(body?.name)
  if (!body || !validDevice(body.device) || !name || !validSettings(body.settings) || !validTimer(body.timer) || (body.open !== undefined && typeof body.open !== 'boolean')) {
    return json({ error: 'bad_request' }, 400)
  }
  // A clash with a live room is rare (23^4 codes); try a few times.
  for (let i = 0; i < 5; i++) {
    const code = makeCode(Math.random)
    const made = await env.ROOMS.get(env.ROOMS.idFromName(code)).create({ code, device: body.device, name, settings: body.settings, timer: body.timer, open: body.open ? 'hosted' : undefined })
    if (made) return json({ code })
  }
  return json({ error: 'busy' }, 503)
}

async function listOpen(env: Env): Promise<Response> {
  try {
    return json({ rooms: await directory(env).list() })
  } catch (error) {
    console.error(`directory: list failed: ${error instanceof Error ? error.stack : String(error)}`)
    return json({ error: 'busy' }, 503)
  }
}

/** A room that fits, or a new one: only a new one counts against the address's limit. */
async function quick(request: Request, env: Env): Promise<Response> {
  const body = await readBody(request)
  const name = cleanName(body?.name)
  if (!body || !validDevice(body.device) || !name || !validMode(body.mode) || (body.skip !== undefined && !validCode(body.skip))) {
    return json({ error: 'bad_request' }, 400)
  }
  const o = { device: body.device, mode: body.mode, skip: body.skip }
  try {
    const found = await directory(env).quick(o)
    if (found) return json({ code: found })
    if (!(await allowed(request, env))) return json({ error: 'too_fast' }, 429)
    const code = await directory(env).make({ ...o, name })
    return code ? json({ code }) : json({ error: 'busy' }, 503)
  } catch (error) {
    console.error(`directory: quick match failed: ${error instanceof Error ? error.stack : String(error)}`)
    return json({ error: 'busy' }, 503)
  }
}
