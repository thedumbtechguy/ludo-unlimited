import type { Color, GameEvent, Move, Settings } from './types'

/** Bumped whenever messages change shape; a device on another version is asked to update. */
export const PROTOCOL_VERSION = 2

export type TurnTimer = 'relaxed' | 'normal' | 'quick' | 'off'
export const TIMER_SECONDS: Record<Exclude<TurnTimer, 'off'>, number> = { relaxed: 60, normal: 30, quick: 15 }

export const REACTIONS = ['laugh', 'clap', 'shock', 'fire', 'hurry', 'wicked'] as const
export type Reaction = (typeof REACTIONS)[number]

export type MemberView = { id: number; name: string; connected: boolean; seat?: Color }

/** The room as every device sees it. No device IDs. */
export type RoomView = {
  code: string
  phase: 'lobby' | 'playing' | 'finished'
  host: number // member id
  settings: Settings
  timer: TurnTimer
  members: MemberView[]
  computers: Color[]
  covering: Color[]
  paused: boolean
  pausedFor?: Color
  log: GameEvent[]
  seq: number
  /** Milliseconds left for the current decision, when a human has the clock. */
  deadlineIn?: number
}

export type YouView = { id: number; seat?: Color; host: boolean }

/** What the join screen learns about a room before connecting. */
export type RoomInfo = { phase: RoomView['phase']; players: number; seatsFree: number }

export type ClientMessage =
  | { t: 'sit'; color: Color }
  | { t: 'stand' }
  | { t: 'takeover'; color: Color }
  | { t: 'settings'; settings: Settings; timer: TurnTimer }
  | { t: 'start'; empty: 'computers' | 'drop' }
  | { t: 'roll' }
  | { t: 'move'; move: Move }
  | { t: 'stop' }
  | { t: 'pause'; for?: Color }
  | { t: 'resume' }
  | { t: 'react'; id: Reaction }
  | { t: 'rematch' }
  | { t: 'rename'; name: string }
  | { t: 'sync' }

export type ErrorCode = 'not_found' | 'old_version' | 'not_your_turn' | 'illegal' | 'too_fast' | 'replaced'

export type ServerMessage =
  | { t: 'room'; room: RoomView; you: YouView }
  | { t: 'event'; seq: number; event: GameEvent; by: 'human' | 'computer' }
  | { t: 'clock'; deadlineIn?: number; paused: boolean; pausedFor?: Color; covering: Color[] }
  | { t: 'reaction'; color: Color; id: Reaction }
  | { t: 'error'; code: ErrorCode }
