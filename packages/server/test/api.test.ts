import { PROTOCOL_VERSION, replay, settingsFor, type GameEvent, type Listing, type ServerMessage } from '@ludo/engine'
import { runDurableObjectAlarm, runInDurableObject } from 'cloudflare:test'
import { env, exports } from 'cloudflare:workers'
import { describe, expect, it, vi } from 'vitest'
import { DAY, type Room } from '../src/room'

const BASE = 'http://ludo.test'
let ipCounter = 0
const create = (body: unknown, ip = `10.0.0.${++ipCounter}`) =>
  exports.default.fetch(`${BASE}/api/rooms`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': ip },
    body: JSON.stringify(body),
  })
const goodBody = { device: 'host', name: 'Ama', settings: settingsFor('ghana', 4, 'firstWins'), timer: 'normal' }
const newRoom = async () => ((await (await create(goodBody)).json()) as { code: string }).code

/** Open a socket and collect what it's sent. */
async function open(code: string, device: string, v = PROTOCOL_VERSION) {
  const res = await exports.default.fetch(`${BASE}/api/rooms/${code}/socket?device=${device}&name=${device}&v=${v}`, { headers: { Upgrade: 'websocket' } })
  const ws = res.webSocket!
  const got: ServerMessage[] = []
  ws.addEventListener('message', (e: MessageEvent) => {
    got.push(JSON.parse(e.data as string))
  })
  ws.accept()
  return { ws, got }
}
const settle = () => new Promise((r) => setTimeout(r, 50))
const lastRoom = (got: ServerMessage[]) => got.filter((m) => m.t === 'room').at(-1)
const post = (path: string, body: unknown, ip = `10.1.0.${++ipCounter}`) =>
  exports.default.fetch(`${BASE}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': ip }, body: JSON.stringify(body) })
const quickMatch = async (device: string, mode = 'classic', skip?: string) => {
  const res = await post('/api/quick', { device, name: device, mode, skip })
  return { status: res.status, code: res.ok ? ((await res.json()) as { code: string }).code : undefined }
}
const openList = async () => ((await (await exports.default.fetch(`${BASE}/api/open`)).json()) as { rooms: Listing[] }).rooms

describe('api', () => {
  it('creates a room and looks it up', async () => {
    const res = await create(goodBody)
    expect(res.status).toBe(200)
    const { code } = (await res.json()) as { code: string }
    expect(code).toMatch(/^[A-Z]{4}$/)
    const info = await exports.default.fetch(`${BASE}/api/rooms/${code.toLowerCase()}`)
    // The creator's seat counts as taken once they're connected.
    expect(await info.json()).toEqual({ phase: 'lobby', players: 4, seatsFree: 4 })
    await open(code, 'host')
    await settle()
    const after = await exports.default.fetch(`${BASE}/api/rooms/${code}`)
    expect(await after.json()).toEqual({ phase: 'lobby', players: 4, seatsFree: 3 })
  })

  it('refuses a bad body and an unknown code', async () => {
    expect((await create({ ...goodBody, timer: 'forever' })).status).toBe(400)
    expect((await create('nope')).status).toBe(400)
    expect((await exports.default.fetch(`${BASE}/api/rooms/ZZZZ`)).status).toBe(404)
    expect((await exports.default.fetch(`${BASE}/api/rooms/TOOLONG`)).status).toBe(404)
  })

  it('refuses an oversized body', async () => {
    expect((await create({ ...goodBody, pad: 'x'.repeat(5000) })).status).toBe(400)
  })

  it('stores only the known settings', async () => {
    const res = await create({ ...goodBody, settings: { ...goodBody.settings, junk: 'x'.repeat(500), rules: { ...goodBody.settings.rules, extra: 1 } } })
    const { code } = (await res.json()) as { code: string }
    const room = await runInDurableObject(env.ROOMS.get(env.ROOMS.idFromName(code)), (_, state) => state.storage.get<Room>('room'))
    expect(room!.settings).toEqual(goodBody.settings)
  })

  it('allows 3 rooms a minute from one address', async () => {
    const statuses = []
    for (let i = 0; i < 4; i++) statuses.push((await create(goodBody, '10.9.9.9')).status)
    expect(statuses).toEqual([200, 200, 200, 429])
  })

  it('two devices join over sockets and both hear about each other', async () => {
    const code = await newRoom()
    const host = await open(code, 'host')
    const kofi = await open(code, 'kofi')
    await settle()
    expect(lastRoom(host.got)).toMatchObject({ t: 'room', you: { host: true }, room: { members: [{ name: 'host', seat: 'red' }, { name: 'kofi' }] } })
    expect(kofi.got.some((m) => m.t === 'room')).toBe(true)
  })

  it('ignores junk on the socket', async () => {
    const code = await newRoom()
    const host = await open(code, 'host')
    await settle()
    const before = host.got.length
    for (const junk of ['not json', 'null', '{"t":5}', 'x'.repeat(5000)]) host.ws.send(junk)
    await settle()
    expect(host.got.length).toBe(before)
  })

  it('answers a ping with a pong', async () => {
    const code = await newRoom()
    const res = await exports.default.fetch(`${BASE}/api/rooms/${code}/socket?device=host&name=host&v=${PROTOCOL_VERSION}`, { headers: { Upgrade: 'websocket' } })
    const ws = res.webSocket!
    const got: string[] = []
    ws.addEventListener('message', (e: MessageEvent) => got.push(e.data as string))
    ws.accept()
    await settle()
    ws.send('ping')
    await settle()
    expect(got.at(-1)).toBe('pong')
  })

  it('tells an old app to update, and an unknown room that it is gone', async () => {
    const code = await newRoom()
    const old = await open(code, 'x', PROTOCOL_VERSION - 1)
    const lost = await open('QQQQ', 'y')
    await settle()
    expect(old.got).toEqual([{ t: 'error', code: 'old_version' }])
    expect(lost.got).toEqual([{ t: 'error', code: 'not_found' }])
  })

  it('lets the newest tab of a device play', async () => {
    const code = await newRoom()
    const first = await open(code, 'host')
    await settle()
    const second = await open(code, 'host')
    await settle()
    expect(first.got.at(-1)).toEqual({ t: 'error', code: 'replaced' })
    // The old tab closing didn't count as the player leaving, so the creator keeps the first seat.
    expect(lastRoom(second.got)).toMatchObject({ room: { members: [{ name: 'host', seat: 'red', connected: true }] } })
  })

  it('removes a room a day after it was last used', async () => {
    const code = await newRoom()
    const host = await open(code, 'host')
    await settle()
    const stub = env.ROOMS.get(env.ROOMS.idFromName(code))
    await runInDurableObject(stub, async (instance, state) => {
      const room = (await state.storage.get<Room>('room'))!
      room.lastActive -= DAY
      await state.storage.put('room', room)
      // Drop the copy in memory so the alarm reads the aged room.
      ;(instance as unknown as { room?: Room }).room = undefined
    })
    expect(await runDurableObjectAlarm(stub)).toBe(true)
    await settle()
    expect(host.got.at(-1)).toEqual({ t: 'error', code: 'not_found' })
    expect((await exports.default.fetch(`${BASE}/api/rooms/${code}`)).status).toBe(404)
    expect(await runInDurableObject(stub, (_, state) => state.storage.list())).toEqual(new Map())
    // The code can be used again.
    expect(await stub.create({ code, device: 'next', name: 'Kofi', settings: goodBody.settings, timer: 'normal' })).toBe(true)
  })

  it('a room that throws says it is broken, logs why, and closes, rather than leave the device waiting', async () => {
    const code = await newRoom()
    const stub = env.ROOMS.get(env.ROOMS.idFromName(code))
    await runInDurableObject(stub, async (instance, state) => {
      const room = (await state.storage.get<Room>('room'))!
      // A stored room the code can't handle.
      ;(room as unknown as { members: null }).members = null
      await state.storage.put('room', room)
      ;(instance as unknown as { room?: Room }).room = undefined
    })
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const host = await open(code, 'host')
    const closed = new Promise<number>((resolve) => host.ws.addEventListener('close', (e: CloseEvent) => resolve(e.code)))
    await settle()
    expect(host.got).toEqual([{ t: 'error', code: 'broken' }])
    expect(await closed).toBe(4000)
    expect(error).toHaveBeenCalledWith(expect.stringMatching(new RegExp(`^room ${code}: connect failed: TypeError`)))
    error.mockRestore()
  })

  it('an old room whose log no longer plays goes on from before the bad event', async () => {
    const code = await newRoom()
    const stub = env.ROOMS.get(env.ROOMS.idFromName(code))
    const roll3: GameEvent = { type: 'roll', value: 3 }
    const illegal: GameEvent = { type: 'move', move: { kind: 'enter', piece: { color: 'red', index: 0 }, to: { kind: 'track', index: 40 } } }
    await runInDurableObject(stub, async (instance, state) => {
      const room = (await state.storage.get<Room>('room'))!
      // Stored before rooms kept their game, under rules that allowed that move.
      Object.assign(room, { phase: 'playing', log: [roll3, illegal, roll3], seq: 3, computers: ['yellow', 'green', 'blue'] })
      await state.storage.put('room', room)
      ;(instance as unknown as { room?: Room }).room = undefined
    })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const host = await open(code, 'host')
    await settle()
    expect(lastRoom(host.got)).toMatchObject({ room: { phase: 'playing', seq: 4, game: JSON.parse(JSON.stringify(replay(goodBody.settings, [roll3]))) } })
    const stored = await runInDurableObject(stub, (_, state) => state.storage.get<Room>('room'))
    expect([stored!.log, stored!.game]).toEqual([[roll3], replay(goodBody.settings, [roll3])])
    warn.mockRestore()
  })
})

describe('open rooms', () => {
  it('a hosted open room is listed; a private one is not', async () => {
    const open = ((await (await create({ ...goodBody, open: true })).json()) as { code: string }).code
    const shut = await newRoom()
    await settle()
    const codes = (await openList()).map((l) => l.code)
    expect(codes).toContain(open)
    expect(codes).not.toContain(shut)
    expect((await openList()).find((l) => l.code === open)).toMatchObject({ kind: 'hosted', host: 'Ama', seatsFree: 3 })
  })

  it('refuses a bad open', async () => {
    expect((await create({ ...goodBody, open: 'yes' })).status).toBe(400)
  })

  it('quick match makes a room, and the next quick match in that mode joins it', async () => {
    const first = await quickMatch('q1', 'ghana')
    expect(first.status).toBe(200)
    await settle()
    expect((await quickMatch('q2', 'ghana')).code).toBe(first.code)
    // Skipping it makes another.
    const other = await quickMatch('q3', 'ghana', first.code)
    expect(other.code).not.toBe(first.code)
  })

  it('the quick match creator holds the first seat when they connect', async () => {
    const { code } = await quickMatch('q4', 'classic', 'ZZZZ')
    const q4 = await open(code!, 'q4')
    await settle()
    expect(lastRoom(q4.got)).toMatchObject({ you: { seat: 'red', host: false }, room: { open: 'quick' } })
  })

  it('two quick matches at once make one room, and it is listed', async () => {
    // An earlier test's classic room may take them both; either way they share a room.
    const [c1, c2] = await Promise.all([quickMatch('c1', 'classic', 'YYYY'), quickMatch('c2', 'classic', 'YYYY')])
    expect(c1.code).toBeDefined()
    expect(c2.code).toBe(c1.code)
    await settle()
    expect((await openList()).map((l) => l.code)).toContain(c1.code)
  })

  it('refuses a bad quick match', async () => {
    expect((await post('/api/quick', { device: 'd', name: 'D', mode: 'custom' })).status).toBe(400)
    expect((await post('/api/quick', { device: '', name: 'D', mode: 'ghana' })).status).toBe(400)
    expect((await post('/api/quick', { device: 'd', name: 'D', mode: 'ghana', skip: 'bad' })).status).toBe(400)
  })
})
