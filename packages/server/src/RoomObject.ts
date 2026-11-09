import { PROTOCOL_VERSION, SEATS, type ClientMessage, type ErrorCode, type RoomInfo, type Level, type Settings, type TurnTimer } from '@ludo/engine'
import { DurableObject } from 'cloudflare:workers'
import { createRoom, DAY, recover, reduce, type Input, type Room, type Step } from './room'

export type Env = { ROOMS: DurableObjectNamespace<RoomObject>; CREATE_LIMIT: RateLimit }

const MAX_MESSAGE = 2048
const random = () => crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32

/** One room: its state in storage, its players' sockets (tagged with their device ID), its alarm. */
export class RoomObject extends DurableObject<Env> {
  /** null once we know there's no room here. */
  private room?: Room | null

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    // Devices ping to find dead sockets; answered without waking the room.
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'))
  }

  private async load(): Promise<Room | undefined> {
    if (this.room === undefined) {
      const stored = await this.ctx.storage.get<Room>('room')
      this.room = stored ? recover(stored, Date.now()) : null
      if (stored && this.room !== stored) await this.ctx.storage.put('room', this.room)
    }
    return this.room ?? undefined
  }

  /** Make the room; false when this code is already taken. */
  async create(o: { code: string; device: string; name: string; settings: Settings; timer: TurnTimer; level: Level }): Promise<boolean> {
    if (await this.load()) return false
    this.room = createRoom({ ...o, now: Date.now() })
    await this.ctx.storage.put('room', this.room)
    await this.ctx.storage.setAlarm(this.room.lastActive + DAY)
    return true
  }

  async info(): Promise<RoomInfo | undefined> {
    const room = await this.load()
    if (!room) return undefined
    const taken = room.members.filter((m) => m.seat && m.connected).length
    return { phase: room.phase, players: room.settings.players, seatsFree: room.phase === 'lobby' ? SEATS[room.settings.players].length - taken : 0 }
  }

  /** The WebSocket upgrade, forwarded by the Worker. */
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)
    const device = url.searchParams.get('device') ?? ''
    const [client, server] = Object.values(new WebSocketPair())
    const refuse = (code: ErrorCode) => {
      server.accept()
      server.send(JSON.stringify({ t: 'error', code }))
      server.close(4000, code)
      return new Response(null, { status: 101, webSocket: client })
    }
    if (Number(url.searchParams.get('v')) !== PROTOCOL_VERSION) return refuse('old_version')
    if (!device || device.length > 64 || !(await this.load())) return refuse('not_found')
    // The same device in another tab: the newest one plays.
    for (const old of this.open(device)) {
      old.send(JSON.stringify({ t: 'error', code: 'replaced' }))
      old.close(4001, 'replaced')
    }
    this.ctx.acceptWebSocket(server, [device])
    await this.apply({ type: 'connect', device, name: url.searchParams.get('name') ?? '' }, server)
    return new Response(null, { status: 101, webSocket: client })
  }

  async webSocketMessage(ws: WebSocket, data: string | ArrayBuffer): Promise<void> {
    if (typeof data !== 'string' || data.length > MAX_MESSAGE) return
    let msg: ClientMessage
    try {
      msg = JSON.parse(data)
    } catch {
      return
    }
    if (typeof msg?.t !== 'string') return
    await this.apply({ type: 'message', device: this.ctx.getTags(ws)[0], msg }, ws)
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    const device = this.ctx.getTags(ws)[0]
    // A replaced tab closing doesn't mean the player left.
    if (this.open(device).some((other) => other !== ws)) return
    await this.apply({ type: 'disconnect', device })
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    await this.webSocketClose(ws)
  }

  async alarm(): Promise<void> {
    await this.apply({ type: 'alarm' })
  }

  /** Sockets we can still send to; closing ones are on their way out. */
  private open(device?: string): WebSocket[] {
    return this.ctx.getWebSockets(device).filter((ws) => ws.readyState === WebSocket.OPEN)
  }

  /**
   * Run an input through the room. If the room throws (a bug, or a stored game the code can no
   * longer play), nothing changes and the socket that sent it is told the room is broken, so its
   * device stops waiting rather than reconnecting forever.
   */
  private async apply(input: Input, from?: WebSocket): Promise<void> {
    const room = await this.load()
    if (!room) return
    let step: Step
    try {
      step = reduce(room, input, Date.now(), random)
    } catch (error) {
      // Can't be recovered here: say so in the logs (Workers observability keeps them).
      const what = input.type === 'message' ? `message ${input.msg.t}` : input.type
      console.error(`room ${room.code}: ${what} failed: ${error instanceof Error ? error.stack : String(error)}`)
      if (from?.readyState === WebSocket.OPEN) {
        from.send(JSON.stringify({ t: 'error', code: 'broken' }))
        from.close(4000, 'broken')
      }
      return
    }
    if (step.remove) {
      await this.ctx.storage.deleteAll()
      this.room = null
      for (const ws of this.open()) {
        ws.send(JSON.stringify({ t: 'error', code: 'not_found' }))
        ws.close(4000, 'not_found')
      }
      return
    }
    this.room = step.room
    await this.ctx.storage.put('room', step.room)
    await this.ctx.storage.setAlarm(step.alarm)
    for (const { to, msg } of step.sends) {
      const text = JSON.stringify(msg)
      for (const ws of this.open(to === 'all' ? undefined : to)) ws.send(text)
    }
  }
}
