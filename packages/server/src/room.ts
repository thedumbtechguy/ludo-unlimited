import {
  COLORS,
  createGame,
  currentMover,
  replay,
  SEATS,
  type ClientMessage,
  type Color,
  type ErrorCode,
  type GameEvent,
  type GameState,
  type RoomView,
  type ServerMessage,
  type Settings,
  type TurnTimer,
  type YouView,
} from '@ludo/engine'
import { cleanName, validSettings, validTimer } from './validate'

export const DAY = 24 * 60 * 60 * 1000

export type Member = { id: number; device: string; name: string; connected: boolean; seat?: Color; reactedAt?: number }

export type Room = {
  code: string
  phase: 'lobby' | 'playing' | 'finished'
  host: string
  settings: Settings
  timer: TurnTimer
  members: Member[]
  nextId: number
  computers: Color[]
  covering: Color[]
  paused: boolean
  pausedFor?: Color
  log: GameEvent[]
  seq: number
  /** When the human who has to act runs out of time. */
  deadline?: number
  /** When the computer next acts, for a computer seat or one it's covering. */
  botAt?: number
  lastActive: number
}

export type Input =
  | { type: 'connect'; device: string; name: string }
  | { type: 'disconnect'; device: string }
  | { type: 'message'; device: string; msg: ClientMessage }
  | { type: 'alarm' }

export type Send = { to: 'all' | string; msg: ServerMessage }
/** The room after an input, what to send, when to wake next, and whether the room is over for good. */
export type Step = { room: Room; sends: Send[]; alarm: number; remove: boolean }

type Ctx = { room: Room; sends: Send[]; now: number; random: () => number }

export function createRoom(o: { code: string; device: string; name: string; settings: Settings; timer: TurnTimer; now: number }): Room {
  return {
    code: o.code,
    phase: 'lobby',
    host: o.device,
    settings: o.settings,
    timer: o.timer,
    members: [{ id: 1, device: o.device, name: cleanName(o.name) ?? 'Player', connected: false }],
    nextId: 2,
    computers: [],
    covering: [],
    paused: false,
    log: [],
    seq: 0,
    lastActive: o.now,
  }
}

export function reduce(prev: Room, input: Input, now: number, random: () => number): Step {
  const ctx: Ctx = { room: structuredClone(prev), sends: [], now, random }
  const { room } = ctx
  if (input.type === 'alarm') {
    if (now >= room.lastActive + DAY) return { room, sends: [], alarm: now, remove: true }
    tick(ctx)
  } else {
    room.lastActive = now
    if (input.type === 'connect') connect(ctx, input.device, input.name)
    else if (input.type === 'disconnect') disconnect(ctx, input.device)
    else message(ctx, input.device, input.msg)
  }
  return { room, sends: ctx.sends, alarm: Math.min(room.botAt ?? Infinity, room.deadline ?? Infinity, room.lastActive + DAY), remove: false }
}

export function viewOf(room: Room, now: number): RoomView {
  return {
    code: room.code,
    phase: room.phase,
    host: room.members.find((m) => m.device === room.host)?.id ?? 0,
    settings: room.settings,
    timer: room.timer,
    members: room.members.map(({ id, name, connected, seat }) => ({ id, name, connected, seat })),
    computers: room.computers,
    covering: room.covering,
    paused: room.paused,
    pausedFor: room.pausedFor,
    log: room.log,
    seq: room.seq,
    deadlineIn: room.deadline === undefined ? undefined : Math.max(0, room.deadline - now),
  }
}

const youOf = (room: Room, m: Member): YouView => ({ id: m.id, seat: m.seat, host: room.host === m.device })

export const gameOf = (room: Room): GameState => replay(room.settings, room.log)
/** The seat that has to act: the Labourer owner while they play someone's roll, otherwise the turn player. */
export const actorOf = (game: GameState): Color => currentMover(game) ?? game.turn

const memberOf = (room: Room, device: string) => room.members.find((m) => m.device === device)
const seated = (room: Room) => room.members.filter((m) => m.seat)
const seatConnected = (room: Room, color: Color) => room.members.some((m) => m.seat === color && m.connected)
export const anyoneSeatedConnected = (room: Room) => room.members.some((m) => m.seat && m.connected)

function sendRoom(ctx: Ctx, m: Member): void {
  ctx.sends.push({ to: m.device, msg: { t: 'room', room: viewOf(ctx.room, ctx.now), you: youOf(ctx.room, m) } })
}
const broadcastRoom = (ctx: Ctx) => ctx.room.members.filter((m) => m.connected).forEach((m) => sendRoom(ctx, m))

function refuse(ctx: Ctx, device: string, code: ErrorCode): void {
  ctx.sends.push({ to: device, msg: { t: 'error', code } })
  const m = memberOf(ctx.room, device)
  if (m) sendRoom(ctx, m)
}

/** The next connected seated member in colour order, else any connected member. */
function handOver(room: Room): void {
  const next = COLORS.map((c) => room.members.find((m) => m.seat === c && m.connected)).find(Boolean) ?? room.members.find((m) => m.connected)
  if (next) room.host = next.device
}

function connect(ctx: Ctx, device: string, name: string): void {
  const { room } = ctx
  const wasIdle = !anyoneSeatedConnected(room)
  let m = memberOf(room, device)
  if (m) {
    m.connected = true
    m.name = cleanName(name) ?? m.name
  } else {
    m = { id: room.nextId++, device, name: cleanName(name) ?? 'Player', connected: true }
    room.members.push(m)
  }
  if (!memberOf(room, room.host)?.connected) room.host = device
  const unpaused = room.pausedFor !== undefined && m.seat === room.pausedFor
  if (unpaused) {
    room.paused = false
    room.pausedFor = undefined
  }
  if (room.phase === 'playing' && (wasIdle || unpaused)) schedule(ctx, gameOf(room), ctx.now)
  broadcastRoom(ctx)
}

function disconnect(ctx: Ctx, device: string): void {
  const { room } = ctx
  const m = memberOf(room, device)
  if (!m) return
  m.connected = false
  if (room.phase === 'lobby') m.seat = undefined
  if (room.phase === 'playing') leaveGame(ctx, m) // Task 5
  if (room.host === device) handOver(room)
  broadcastRoom(ctx)
}

function message(ctx: Ctx, device: string, msg: ClientMessage): void {
  const { room } = ctx
  const m = memberOf(room, device)
  if (!m) return
  const host = room.host === device
  switch (msg.t) {
    case 'sit': {
      const free = room.phase === 'lobby' && SEATS[room.settings.players].includes(msg.color) && !room.members.some((o) => o.seat === msg.color)
      if (!free) return refuse(ctx, device, 'illegal')
      m.seat = msg.color
      return broadcastRoom(ctx)
    }
    case 'stand':
      if (room.phase !== 'lobby') return refuse(ctx, device, 'illegal')
      m.seat = undefined
      return broadcastRoom(ctx)
    case 'rejoin':
      return rejoin(ctx, m, msg.color)
    case 'settings': {
      if (!host || room.phase !== 'lobby' || !validSettings(msg.settings) || !validTimer(msg.timer)) return refuse(ctx, device, 'illegal')
      room.settings = msg.settings
      room.timer = msg.timer
      for (const o of room.members) if (o.seat && !SEATS[msg.settings.players].includes(o.seat)) o.seat = undefined
      return broadcastRoom(ctx)
    }
    case 'start':
      if (!host || room.phase !== 'lobby' || !start(ctx, msg.empty)) return refuse(ctx, device, 'illegal')
      return broadcastRoom(ctx)
    case 'rename': {
      const name = cleanName(msg.name)
      if (!name) return refuse(ctx, device, 'illegal')
      m.name = name
      return broadcastRoom(ctx)
    }
    case 'sync':
      return sendRoom(ctx, m)
    default:
      return play(ctx, m, msg) // Task 5: roll, move, stop, pause, resume, react, rematch
  }
}

/** "Rejoin as …": take over a seat whose player has gone. */
function rejoin(ctx: Ctx, m: Member, color: Color): void {
  const { room } = ctx
  const old = room.members.find((o) => o.seat === color)
  if (room.phase === 'lobby' || !old || old.connected || old === m || m.seat) return refuse(ctx, m.device, 'illegal')
  old.seat = undefined
  m.seat = color
  if (room.host === old.device) room.host = m.device
  if (room.pausedFor === color) {
    room.paused = false
    room.pausedFor = undefined
    schedule(ctx, gameOf(room), ctx.now)
  }
  broadcastRoom(ctx)
}

function start(ctx: Ctx, empty: 'computers' | 'drop'): boolean {
  const { room } = ctx
  const people = seated(room)
  if (empty === 'drop') {
    if (people.length < 2) return false
    const n = people.length as 2 | 3 | 4
    const target = SEATS[n]
    const keep = people.filter((m) => target.includes(m.seat!))
    const free = target.filter((c) => !keep.some((m) => m.seat === c))
    people.filter((m) => !keep.includes(m)).forEach((m, i) => (m.seat = free[i]))
    room.settings = { ...room.settings, players: n }
    room.computers = []
  } else {
    if (people.length < 1) return false
    room.computers = SEATS[room.settings.players].filter((c) => !people.some((m) => m.seat === c))
  }
  room.phase = 'playing'
  room.log = []
  room.covering = []
  room.paused = false
  room.pausedFor = undefined
  schedule(ctx, createGame(room.settings), ctx.now)
  return true
}

// Task 5 replaces these with the game.
function schedule(_ctx: Ctx, _game: GameState, _readyAt: number): void {}
function leaveGame(_ctx: Ctx, _m: Member): void {}
function tick(_ctx: Ctx): void {}
function play(ctx: Ctx, m: Member, _msg: ClientMessage): void {
  refuse(ctx, m.device, 'illegal')
}
export { seatConnected }
