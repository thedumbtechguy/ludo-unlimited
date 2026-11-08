import { PROTOCOL_VERSION, settingsFor, type ServerMessage } from '@ludo/engine'
import { runDurableObjectAlarm, runInDurableObject } from 'cloudflare:test'
import { env, exports } from 'cloudflare:workers'
import { describe, expect, it } from 'vitest'
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

describe('api', () => {
  it('creates a room and looks it up', async () => {
    const res = await create(goodBody)
    expect(res.status).toBe(200)
    const { code } = (await res.json()) as { code: string }
    expect(code).toMatch(/^[A-Z]{4}$/)
    const info = await exports.default.fetch(`${BASE}/api/rooms/${code.toLowerCase()}`)
    expect(await info.json()).toEqual({ phase: 'lobby', players: 4, seatsFree: 4 })
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
    host.ws.send(JSON.stringify({ t: 'sit', color: 'red' }))
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
    second.ws.send(JSON.stringify({ t: 'sit', color: 'red' }))
    await settle()
    // The old tab closing didn't count as the player leaving.
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
})
