import {
  ANIMATION_TIMING,
  applyMove,
  chooseMove,
  COLORS,
  createGame,
  currentMover,
  getPlayer,
  eventMs,
  REACTIONS,
  replay,
  pass,
  roll,
  SEATS,
  settingsFor,
  stopRolling,
  TIMER_SECONDS,
  type ClientMessage,
  type Color,
  type ErrorCode,
  type GameEvent,
  type GameState,
  type ModeName,
  type Openness,
  type RoomView,
  type ServerMessage,
  type Settings,
  type TurnTimer,
  type YouView,
} from '@ludo/engine'
import { cleanName, cleanSettings, validSettings, validTimer } from './validate'

export const DAY = 24 * 60 * 60 * 1000
export const QUICK_START_MS = 20_000
export const QUICK_REMATCH_MS = 15_000
/** Open rooms: how long a player can be away mid-game before their seat opens to others. */
export const SEAT_RELEASE_MS = 120_000
export const QUICK_TIMER: TurnTimer = 'normal'
export const quickSettings = (mode: ModeName): Settings => settingsFor(mode, 4, 'firstWins')

export type Member = { id: number; device: string; name: string; connected: boolean; seat?: Color; reactedAt?: number; leftAt?: number }

export type Room = {
  code: string
  phase: 'lobby' | 'playing' | 'finished'
  /** The device that created the room; it takes the host role back whenever it connects. */
  owner?: string
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
  /**
   * The game being played, kept so a room never has to replay its log: a rule change can make an
   * old log unreplayable. Absent in the lobby, and in rooms stored before it existed (see `recover`).
   */
  game?: GameState
  /** Keeps counting across rematches; devices take it from the room message, never from log.length. */
  seq: number
  /** When devices have finished showing the last event. */
  readyAt?: number
  /** When the human who has to act runs out of time. */
  deadline?: number
  /** When the computer next acts, for a computer seat or one it's covering. */
  botAt?: number
  lastActive: number
  /** Missing: private, the code only. */
  open?: Openness
  /** Open rooms: seats given to the computer after their player stayed away, so they get them back if still free. */
  leftSeats?: Partial<Record<Color, string>>
  /** Quick rooms in the lobby: when the game starts by itself. */
  startAt?: number
  /** Quick rooms after a game: when the next one's lobby opens. */
  rematchAt?: number
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

/** The creator starts on the first seat; it stays theirs when they first connect. A quick room has no owner or host. */
export function createRoom(o: { code: string; device: string; name: string; settings: Settings; timer: TurnTimer; now: number; open?: Openness }): Room {
  const settings = cleanSettings(o.settings)
  const quick = o.open === 'quick'
  return {
    code: o.code,
    phase: 'lobby',
    owner: quick ? undefined : o.device,
    host: quick ? '' : o.device,
    open: o.open,
    settings,
    timer: o.timer,
    members: [{ id: 1, device: o.device, name: cleanName(o.name) ?? 'Player', connected: false, seat: SEATS[settings.players][0] }],
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
  if (quickLobby(ctx)) broadcastRoom(ctx)
  return { room, sends: ctx.sends, alarm: nextAlarm(room), remove: false }
}

/** When the room next has something to do by itself. */
const nextAlarm = (room: Room) =>
  Math.min(room.botAt ?? Infinity, room.deadline ?? Infinity, room.startAt ?? Infinity, room.rematchAt ?? Infinity, releaseAt(room), room.lastActive + DAY)

/** When the next seat left in an open room goes to the computer. */
const releaseAt = (room: Room) => Math.min(...room.members.map((m) => (m.leftAt === undefined ? Infinity : m.leftAt + SEAT_RELEASE_MS)))

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
    game: gameOf(room),
    seq: room.seq,
    deadlineIn: msLeft(room.deadline, now),
    open: room.open,
    startIn: msLeft(room.startAt, now),
    rematchIn: msLeft(room.rematchAt, now),
  }
}

const youOf = (room: Room, m: Member): YouView => ({ id: m.id, seat: m.seat, host: room.host === m.device })

/** The room's game: its snapshot, or in the lobby (empty log) a fresh one. */
export const gameOf = (room: Room): GameState => room.game ?? replay(room.settings, room.log)

/**
 * A room stored before it kept a snapshot, as loaded: replay its log event by event, and if the
 * rules have changed so that an event no longer plays, keep the game as it stood before it. The log
 * is cut there and seq moves on, so devices that were in the game start over from the room.
 */
export function recover(stored: Room, now: number): Room {
  if (stored.game || stored.phase === 'lobby') return stored
  const room = structuredClone(stored)
  let game = createGame(room.settings)
  let played = 0
  try {
    for (const event of room.log) {
      game = step(game, event)
      played += 1
    }
  } catch (error) {
    console.warn(`room ${room.code}: event ${played} of ${room.log.length} no longer plays; the game goes on from before it`, error)
  }
  room.game = game
  if (played === room.log.length) return room
  room.log = room.log.slice(0, played)
  room.seq += 1
  room.phase = game.status === 'finished' ? 'finished' : 'playing'
  room.readyAt = undefined
  schedule({ room, sends: [], now, random: Math.random }, game, now)
  return room
}
/** The seat that has to act: the Labourer owner while they play someone's roll, otherwise the turn player. */
const actorOf = (game: GameState): Color => currentMover(game) ?? game.turn

const memberOf = (room: Room, device: string) => room.members.find((m) => m.device === device)
const seated = (room: Room) => room.members.filter((m) => m.seat)
const seatConnected = (room: Room, color: Color) => room.members.some((m) => m.seat === color && m.connected)
const anyoneSeatedConnected = (room: Room) => room.members.some((m) => m.seat && m.connected)

function sendRoom(ctx: Ctx, m: Member): void {
  ctx.sends.push({ to: m.device, msg: { t: 'room', room: viewOf(ctx.room, ctx.now), you: youOf(ctx.room, m) } })
}
const broadcastRoom = (ctx: Ctx) => ctx.room.members.filter((m) => m.connected).forEach((m) => sendRoom(ctx, m))

function refuse(ctx: Ctx, device: string, code: ErrorCode): void {
  ctx.sends.push({ to: device, msg: { t: 'error', code } })
  const m = memberOf(ctx.room, device)
  if (m) sendRoom(ctx, m)
}

/**
 * The one place the host is chosen, called after anything that can change it: the owner if
 * connected; else the current host if connected and seated (or nobody connected is seated);
 * else the first connected seated member in colour order; else any connected member.
 */
function pickHost(room: Room): void {
  if (room.open === 'quick') return
  const owner = memberOf(room, room.owner ?? '')
  if (owner?.connected) return void (room.host = owner.device)
  const connected = room.members.filter((m) => m.connected)
  const current = connected.find((m) => m.device === room.host)
  if (current && (current.seat || !connected.some((m) => m.seat))) return
  const next = COLORS.map((c) => connected.find((m) => m.seat === c)).find(Boolean) ?? connected[0]
  if (next) room.host = next.device
}

function connect(ctx: Ctx, device: string, name: string): void {
  const { room } = ctx
  const wasIdle = !anyoneSeatedConnected(room)
  let m = memberOf(room, device)
  if (m) {
    m.connected = true
    m.leftAt = undefined
    m.name = cleanName(name) ?? m.name
  } else {
    m = { id: room.nextId++, device, name: cleanName(name) ?? 'Player', connected: true }
    room.members.push(m)
  }
  if (!m.seat) claim(room, m)
  pickHost(room)
  back(ctx, m.seat, wasIdle)
  broadcastRoom(ctx)
}

/** Computer seats a watcher could take: still in the game. */
const takeable = (room: Room, game: GameState): Color[] => room.computers.filter((c) => getPlayer(game, c).finishedPlace === undefined)

/** A computer seat becomes the member's. Covered until its next turn starts, like a player who is back. */
function takeSeat(room: Room, m: Member, color: Color): void {
  room.computers = room.computers.filter((c) => c !== color)
  room.covering.push(color)
  m.seat = color
}

/**
 * Open rooms seat some arrivals themselves: a player gets back the seat they stayed away from,
 * if it's still the computer's; a quick room seats anyone, on a free seat or a computer seat.
 */
function claim(room: Room, m: Member): void {
  if (room.open === 'quick' && room.phase === 'lobby') {
    m.seat = SEATS[room.settings.players].find((c) => !room.members.some((o) => o.seat === c))
    return
  }
  if (!room.open || room.phase !== 'playing') return
  const own = COLORS.find((c) => room.leftSeats?.[c] === m.device && room.computers.includes(c))
  const color = own ?? (room.open === 'quick' ? takeable(room, gameOf(room))[0] : undefined)
  if (color) takeSeat(room, m, color)
}

/**
 * A seat's player is back. Restart the clock if the room was idle or paused for them, and hand
 * back their turn if it's just starting. A turn the computer has begun, it finishes.
 */
function back(ctx: Ctx, seat: Color | undefined, wasIdle: boolean): void {
  const { room } = ctx
  const unpaused = room.pausedFor !== undefined && room.pausedFor === seat
  if (unpaused) {
    room.paused = false
    room.pausedFor = undefined
  }
  if (room.phase !== 'playing') return
  const game = gameOf(room)
  const turnStarts = seat === game.turn && room.covering.includes(seat) && game.pendingRoll === undefined && game.queuedRolls.length === 0
  if (wasIdle || unpaused || turnStarts) schedule(ctx, game, readyAt(ctx))
}

/** Now, or later while devices are still showing the last event. */
const readyAt = (ctx: Ctx) => Math.max(ctx.room.readyAt ?? ctx.now, ctx.now)

/** Forget watchers who have left. Seated members stay, so their seat is still theirs when they come back. */
function prune(room: Room): void {
  room.members = room.members.filter((m) => m.connected || m.seat || m.device === room.host || m.device === room.owner)
}

function disconnect(ctx: Ctx, device: string): void {
  const { room } = ctx
  const m = memberOf(room, device)
  if (!m) return
  m.connected = false
  // In the lobby the seat stays theirs (phones drop sockets all the time); nobody else can take it. Start leaves them out.
  // A quick room can't wait for them: the seat is free for the next arrival.
  if (room.open === 'quick' && room.phase === 'lobby') m.seat = undefined
  if (room.phase === 'playing') {
    leaveGame(ctx, m)
    // A player who has finished has nothing left to play, so nobody needs their seat.
    const playingOn = m.seat && !room.computers.includes(m.seat) && getPlayer(gameOf(room), m.seat).finishedPlace === undefined
    if (room.open && playingOn) m.leftAt = ctx.now
  }
  pickHost(room)
  prune(room)
  broadcastRoom(ctx)
}

function message(ctx: Ctx, device: string, msg: ClientMessage): void {
  const { room } = ctx
  const m = memberOf(room, device)
  if (!m) return
  const host = room.host === device
  switch (msg.t) {
    case 'sit': {
      if (room.open === 'quick') return refuse(ctx, device, 'illegal')
      // A seat stays its holder's while they're away; only an empty seat can be taken.
      const free = room.phase === 'lobby' && SEATS[room.settings.players].includes(msg.color) && !room.members.some((o) => o.seat === msg.color)
      if (!free) return refuse(ctx, device, 'illegal')
      m.seat = msg.color
      pickHost(room)
      prune(room)
      return broadcastRoom(ctx)
    }
    case 'stand':
      if (room.open === 'quick') return refuse(ctx, device, 'illegal')
      if (room.phase !== 'lobby') return refuse(ctx, device, 'illegal')
      m.seat = undefined
      pickHost(room)
      return broadcastRoom(ctx)
    case 'takeover':
      return takeover(ctx, m, msg.color)
    case 'settings': {
      if (!host || room.phase !== 'lobby' || !validSettings(msg.settings) || !validTimer(msg.timer) || typeof msg.open !== 'boolean') return refuse(ctx, device, 'illegal')
      room.settings = cleanSettings(msg.settings)
      room.timer = msg.timer
      room.open = msg.open ? 'hosted' : undefined
      for (const o of room.members) if (o.seat && !SEATS[msg.settings.players].includes(o.seat)) o.seat = undefined
      pickHost(room)
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
      return play(ctx, m, msg)
  }
}

/**
 * "Play as Blue": a watcher takes a computer seat, its pieces where they stand. The computer
 * finishes a turn it has begun; the seat is the watcher's from its next turn.
 */
function takeover(ctx: Ctx, m: Member, color: Color): void {
  const { room } = ctx
  if (room.phase !== 'playing' || !room.computers.includes(color) || m.seat) return refuse(ctx, m.device, 'illegal')
  const wasIdle = !anyoneSeatedConnected(room)
  takeSeat(room, m, color)
  pickHost(room)
  back(ctx, color, wasIdle)
  broadcastRoom(ctx)
}

function start(ctx: Ctx, empty: 'computers' | 'drop'): boolean {
  const { room } = ctx
  // Nobody plays for a seat whose holder isn't here.
  for (const o of room.members) if (!o.connected) o.seat = undefined
  pickHost(room)
  prune(room)
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
  room.game = createGame(room.settings)
  room.covering = []
  room.paused = false
  room.pausedFor = undefined
  room.readyAt = room.startAt = undefined
  room.leftSeats = undefined
  for (const o of room.members) o.leftAt = undefined
  schedule(ctx, room.game, ctx.now)
  return true
}

/**
 * Quick rooms start by themselves: at once when every seat has someone here, else when the wait
 * is up. With nobody here the wait stops; the next person seated starts it again. True when
 * something devices show changed.
 */
function quickLobby(ctx: Ctx): boolean {
  const { room, now } = ctx
  if (room.open !== 'quick' || room.phase !== 'lobby') return false
  const here = room.members.filter((m) => m.seat && m.connected).length
  const was = room.startAt
  if (here === SEATS[room.settings.players].length || (here > 0 && room.startAt !== undefined && now >= room.startAt)) {
    room.startAt = undefined
    return start(ctx, 'computers')
  }
  room.startAt = here === 0 ? undefined : (room.startAt ?? now + QUICK_START_MS)
  return room.startAt !== was
}

/** Back to the lobby with the same settings. Seats of players who left are free again; a quick room seats whoever is here. */
function rematch(ctx: Ctx): void {
  const { room } = ctx
  room.phase = 'lobby'
  room.log = []
  room.game = undefined
  room.computers = []
  room.covering = []
  room.paused = false
  room.pausedFor = undefined
  room.deadline = room.botAt = room.readyAt = room.rematchAt = undefined
  room.leftSeats = undefined
  for (const o of room.members) o.leftAt = undefined
  for (const o of room.members) if (!o.connected) o.seat = undefined
  pickHost(room)
  prune(room)
  if (room.open === 'quick') for (const o of room.members) if (o.connected && !o.seat) claim(room, o)
}

const REACT_GAP = 3000
const dieRoll = (random: () => number) => 1 + Math.floor(random() * 6)

const msLeft = (at: number | undefined, now: number) => (at === undefined ? undefined : Math.max(0, at - now))

function clock(ctx: Ctx): void {
  const { room, now } = ctx
  ctx.sends.push({
    to: 'all',
    msg: { t: 'clock', deadlineIn: msLeft(room.deadline, now), paused: room.paused, pausedFor: room.pausedFor, covering: room.covering, rematchIn: msLeft(room.rematchAt, now) },
  })
}

/**
 * Who acts next and when, once devices have shown the last event (`readyAt`). Covering ends at the
 * start of the covered seat's own turn if its player is back, so the computer finishes a turn it began.
 */
function schedule(ctx: Ctx, game: GameState, readyAt: number): void {
  const { room } = ctx
  room.deadline = room.botAt = undefined
  if (room.phase !== 'playing' || room.paused || !anyoneSeatedConnected(room)) return
  const startOfTurn = game.pendingRoll === undefined && game.queuedRolls.length === 0
  if (startOfTurn) room.covering = room.covering.filter((c) => !(c === game.turn && seatConnected(room, c)))
  room.covering = room.covering.filter((c) => getPlayer(game, c).finishedPlace === undefined)
  const actor = actorOf(game)
  const rolling = game.pendingRoll === undefined
  if (room.computers.includes(actor) || room.covering.includes(actor)) {
    room.botAt = readyAt + (rolling ? ANIMATION_TIMING.botRoll : ANIMATION_TIMING.botMove)
  } else if (room.timer !== 'off') {
    room.deadline = readyAt + TIMER_SECONDS[room.timer] * 1000
  }
}

function step(game: GameState, event: GameEvent): GameState {
  switch (event.type) {
    case 'roll':
      return roll(game, event.value)
    case 'move':
      return applyMove(game, event.move)
    case 'stop':
      return stopRolling(game)
    case 'pass':
      return pass(game)
  }
}

/** Play an event; false when the engine refuses it. */
function apply(ctx: Ctx, game: GameState, event: GameEvent, by: 'human' | 'computer'): boolean {
  const { room } = ctx
  let next: GameState
  try {
    next = step(game, event)
  } catch {
    return false
  }
  // The engine's own record of it: a move as matched against the legal moves, with its roll count.
  const recorded = next.log.at(-1)!
  room.log.push(recorded)
  room.game = next
  room.seq += 1
  ctx.sends.push({ to: 'all', msg: { t: 'event', seq: room.seq, event: recorded, by } })
  if (next.status === 'finished') {
    room.phase = 'finished'
    room.deadline = room.botAt = undefined
    if (room.open === 'quick') room.rematchAt = ctx.now + QUICK_REMATCH_MS
  } else {
    room.readyAt = ctx.now + eventMs(game, recorded)
    schedule(ctx, next, room.readyAt)
  }
  clock(ctx)
  return true
}

/** The computer plays one decision for whoever has to act; false when the engine refuses it. */
function computerAct(ctx: Ctx, game: GameState): boolean {
  const event: GameEvent =
    game.pendingRoll === undefined ? { type: 'roll', value: dieRoll(ctx.random) } : { type: 'move', move: chooseMove(game, ctx.random)! }
  return apply(ctx, game, event, 'computer')
}

/** Open rooms: a player away this long gives their seat to the computer, for anyone to take. */
function release(ctx: Ctx): void {
  const { room, now } = ctx
  const due = room.members.filter((m) => m.leftAt !== undefined && now >= m.leftAt + SEAT_RELEASE_MS)
  for (const m of due) m.leftAt = undefined
  if (due.length === 0 || room.phase !== 'playing') return
  for (const m of due) {
    const seat = m.seat!
    room.covering = room.covering.filter((c) => c !== seat)
    room.computers.push(seat)
    room.leftSeats = { ...room.leftSeats, [seat]: m.device }
    m.seat = undefined
  }
  pickHost(room)
  prune(room)
  broadcastRoom(ctx)
}

function tick(ctx: Ctx): void {
  release(ctx)
  const { room, now } = ctx
  if (room.phase === 'finished' && room.rematchAt !== undefined && now >= room.rematchAt) {
    rematch(ctx)
    return broadcastRoom(ctx)
  }
  if (room.phase !== 'playing' || room.paused) return
  const due = room.botAt ?? room.deadline
  if (due === undefined || now < due) return
  // Should never fail; if it does, stop the clocks rather than wake up for it again and again.
  if (!computerAct(ctx, gameOf(room))) room.deadline = room.botAt = undefined
}

function leaveGame(ctx: Ctx, m: Member): void {
  const { room } = ctx
  if (!m.seat || room.computers.includes(m.seat)) return
  if (!room.covering.includes(m.seat)) room.covering.push(m.seat)
  // Only their own decision, or a room left with nobody, changes the clock.
  const game = gameOf(room)
  if (actorOf(game) === m.seat || !anyoneSeatedConnected(room)) schedule(ctx, game, readyAt(ctx))
  clock(ctx)
}

function play(ctx: Ctx, m: Member, msg: ClientMessage): void {
  const { room, now } = ctx
  const host = room.host === m.device
  switch (msg.t) {
    case 'roll':
    case 'move':
    case 'stop': {
      if (room.phase !== 'playing' || room.paused) return refuse(ctx, m.device, 'not_your_turn')
      const game = gameOf(room)
      const actor = actorOf(game)
      if (m.seat !== actor || room.computers.includes(actor) || room.covering.includes(actor)) return refuse(ctx, m.device, 'not_your_turn')
      const event: GameEvent =
        msg.t === 'roll' ? { type: 'roll', value: dieRoll(ctx.random) } : msg.t === 'move' ? { type: 'move', move: msg.move } : { type: 'stop' }
      if (!apply(ctx, game, event, 'human')) refuse(ctx, m.device, 'illegal')
      return
    }
    case 'pause':
      if (!host || room.phase !== 'playing' || room.paused) return refuse(ctx, m.device, 'illegal')
      room.paused = true
      room.pausedFor = msg.for && SEATS[room.settings.players].includes(msg.for) ? msg.for : undefined
      room.deadline = room.botAt = undefined
      return clock(ctx)
    case 'resume':
      if (!host || !room.paused) return refuse(ctx, m.device, 'illegal')
      room.paused = false
      room.pausedFor = undefined
      schedule(ctx, gameOf(room), readyAt(ctx))
      return clock(ctx)
    case 'react':
      if (!m.seat || !REACTIONS.includes(msg.id)) return refuse(ctx, m.device, 'illegal')
      if (m.reactedAt !== undefined && now - m.reactedAt < REACT_GAP) {
        // Just the error: nothing in the room changed.
        ctx.sends.push({ to: m.device, msg: { t: 'error', code: 'too_fast' } })
        return
      }
      m.reactedAt = now
      ctx.sends.push({ to: 'all', msg: { t: 'reaction', color: m.seat, id: msg.id } })
      return
    case 'rematch':
      if (!host || room.phase !== 'finished') return refuse(ctx, m.device, 'illegal')
      rematch(ctx)
      return broadcastRoom(ctx)
    default:
      return refuse(ctx, m.device, 'illegal')
  }
}
