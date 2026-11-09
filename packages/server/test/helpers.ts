import { settingsFor, type ClientMessage, type Openness, type ServerMessage } from '@ludo/engine'
import { createRoom, QUICK_TIMER, quickSettings, reduce, type Input, type Room, type Step } from '../src/room'

export const T0 = 1_000_000

/** Dice and tie-breaks from a fixed list, cycling. */
export const fixedRandom = (values: number[]) => {
  let i = 0
  return () => values[i++ % values.length]
}
/** A random value that rolls `n` on a die. */
export const die = (n: number) => (n - 1) / 6 + 0.01

export function lobby(players: 2 | 3 | 4 = 4, open?: Openness): Room {
  return createRoom({ code: 'KQZM', device: 'host', name: 'Ama', settings: settingsFor('ghana', players, 'firstWins'), timer: 'normal', now: T0, open })
}

/** A quick classic room made by Ama's quick match: she holds red until she connects. */
export const quick = (): Room =>
  createRoom({ code: 'QWRT', device: 'ama', name: 'Ama', settings: quickSettings('classic'), timer: QUICK_TIMER, now: T0, open: 'quick' })

/** Run inputs in order; returns the last step. */
export function run(room: Room, inputs: Input[], now = T0, random = fixedRandom([0.5])): Step {
  let step: Step = { room, sends: [], alarm: 0, remove: false }
  for (const input of inputs) step = reduce(step.room, input, now, random)
  return step
}

export const join = (device: string, name = device): Input => ({ type: 'connect', device, name })
export const say = (device: string, msg: ClientMessage): Input => ({ type: 'message', device, msg })

/** What one device was sent in a step. */
export const sentTo = (step: Step, device: string): ServerMessage[] =>
  step.sends.filter((s) => s.to === device || s.to === 'all').map((s) => s.msg)

export const seatOf = (room: Room, device: string) => room.members.find((m) => m.device === device)?.seat

export const alarm = (room: Room, at: number, random = fixedRandom([die(3)])) => reduce(room, { type: 'alarm' }, at, random)

/** A repeatable stream of random values. */
export const seeded = (seed: number) => () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31)

/** Let the alarms play (computers and timeouts) until `done`. */
export function playOut(room: Room, done: (room: Room) => boolean, random = seeded(7)): Room {
  for (let i = 0; i < 5000 && !done(room); i++) room = alarm(room, Math.min(room.botAt ?? Infinity, room.deadline ?? Infinity), random).room
  return room
}
