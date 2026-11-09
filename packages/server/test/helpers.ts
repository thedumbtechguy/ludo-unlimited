import { settingsFor, type ClientMessage, type ServerMessage } from '@ludo/engine'
import { createRoom, reduce, type Input, type Room, type Step } from '../src/room'

export const T0 = 1_000_000

/** Dice and tie-breaks from a fixed list, cycling. */
export const fixedRandom = (values: number[]) => {
  let i = 0
  return () => values[i++ % values.length]
}
/** A random value that rolls `n` on a die. */
export const die = (n: number) => (n - 1) / 6 + 0.01

export function lobby(players: 2 | 3 | 4 = 4): Room {
  return createRoom({ code: 'KQZM', device: 'host', name: 'Ama', settings: settingsFor('ghana', players, 'firstWins'), timer: 'normal', level: 'normal', now: T0 })
}

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
