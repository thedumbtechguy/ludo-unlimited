import { ANIMATION_TIMING, WICKED_DELAY, chooseMove, createGame, currentMover, replay, type Color, type GameEvent, type GameState, type Settings, type Timing } from '@ludo/engine'
import { useEffect, useState } from 'react'
import type { Dice } from './dice'
import { firstHuman } from './labels'
import type { Seats } from './types'
import { useGameView, type Intent } from './useGameView'

export type { Timing }
export type { Callout } from './useGameView'
export const NORMAL_TIMING: Timing = ANIMATION_TIMING
export const FAST_TIMING: Timing = { botRoll: 0, botMove: 0, step: 0, roll: 0 }
export { WICKED_DELAY }

export type GameOptions = {
  settings: Settings
  seats: Seats
  dice: Dice
  timing: Timing
  log?: GameEvent[]
  initial?: GameState
  random?: () => number
  onChange?: (game: GameState) => void
}

/** A game on this device: its own dice, and the computer playing the computer seats. */
export function useGame({ settings, seats, dice, timing, log, initial, random = Math.random, onChange }: GameOptions) {
  const [start] = useState(() => initial ?? (log ? replay(settings, log) : createGame(settings)))
  const seatOf = (color: Color) => seats[color] ?? 'computer'
  const toEvent = (intent: Intent): GameEvent =>
    intent.t === 'roll' ? { type: 'roll', value: dice() } : intent.t === 'move' ? { type: 'move', move: intent.move } : { type: 'stop' }
  const view = useGameView({
    initial: start,
    timing,
    onChange,
    you: firstHuman(seats, start.players.map((p) => p.color)),
    controls: (color) => seatOf(color) === 'human',
    act: (intent) => view.enqueue(toEvent(intent)),
  })
  const { game, busy } = view

  // Computer seats roll and move by themselves.
  useEffect(() => {
    if (busy || game.status !== 'playing') return
    if (game.pendingRoll === undefined) {
      if (seatOf(game.turn) !== 'computer') return
      const id = setTimeout(() => view.enqueue({ type: 'roll', value: dice() }), timing.botRoll)
      return () => clearTimeout(id)
    }
    const mover = currentMover(game)
    if (mover && seatOf(mover) === 'computer') {
      const id = setTimeout(() => view.enqueue({ type: 'move', move: chooseMove(game, random)! }), timing.botMove)
      return () => clearTimeout(id)
    }
  }, [game, busy])

  return view
}
