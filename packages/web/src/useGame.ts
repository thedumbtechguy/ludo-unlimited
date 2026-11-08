import {
  applyMove,
  chooseMove,
  createGame,
  currentMover,
  legalMoves,
  movePath,
  replay,
  roll as rollDice,
  stopRolling,
  type Color,
  type GameEvent,
  type GameState,
  type Move,
  type PieceId,
  type Position,
  type Settings,
} from '@ludo/engine'
import { useEffect, useRef, useState } from 'react'
import type { Dice } from './dice'
import { kickMessage } from './labels'
import type { Moving } from './layout'
import type { Seats } from './types'

export type Timing = { botRoll: number; botMove: number; step: number; roll: number }
export const NORMAL_TIMING: Timing = { botRoll: 600, botMove: 400, step: 120, roll: 650 }
export const FAST_TIMING: Timing = { botRoll: 0, botMove: 0, step: 0, roll: 0 }

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

type Animation = { piece: PieceId; path: Position[]; step: number; next: GameState }

const samePiece = (a: PieceId, b: PieceId) => a.color === b.color && a.index === b.index

export function useGame({ settings, seats, dice, timing, log, initial, random = Math.random, onChange }: GameOptions) {
  const [game, setGame] = useState(() => initial ?? (log ? replay(settings, log) : createGame(settings)))
  const [animation, setAnimation] = useState<Animation>()
  const [selected, setSelected] = useState<PieceId>()
  const [lastRoll, setLastRoll] = useState<number>()
  const [message, setMessage] = useState<string>()
  const [rollingTo, setRollingTo] = useState<number>()
  const rolling = rollingTo !== undefined
  const rollTimer = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => () => clearTimeout(rollTimer.current), [])

  const seatOf = (color: Color) => seats[color] ?? 'computer'
  const busy = animation !== undefined || rolling
  const mover = currentMover(game)
  const moves = busy ? [] : legalMoves(game)
  const humanToRoll = !busy && game.status === 'playing' && game.pendingRoll === undefined && seatOf(game.turn) === 'human'
  const humanToMove = !busy && mover !== undefined && seatOf(mover) === 'human'

  function applyRoll(value: number) {
    const next = rollDice(game, value)
    setLastRoll(value)
    // Still rolling after a 6 is not a wasted roll: the hint offers rolling again or stopping.
    const wasted = next.pendingRoll === undefined && next.queuedRolls.length === 0
    setMessage(wasted ? 'No moves' : undefined)
    setGame(next)
  }

  function stop() {
    const next = stopRolling(game)
    setMessage(next.pendingRoll === undefined ? 'No moves' : undefined)
    setGame(next)
  }

  function roll() {
    const value = dice()
    if (timing.roll === 0) return applyRoll(value)
    setRollingTo(value)
    rollTimer.current = setTimeout(() => {
      setRollingTo(undefined)
      applyRoll(value)
    }, timing.roll)
  }

  function play(move: Move) {
    const next = applyMove(game, move)
    setSelected(undefined)
    setMessage(kickMessage(move))
    if (timing.step === 0) {
      setGame(next)
    } else {
      setAnimation({ piece: move.piece, path: movePath(game, move), step: 0, next })
    }
  }

  function select(piece: PieceId) {
    const own = moves.filter((m) => samePiece(m.piece, piece))
    if (own.length === 1) {
      play(own[0])
    } else {
      setSelected(piece)
    }
  }

  function deselect() {
    setSelected(undefined)
  }

  useEffect(() => {
    onChange?.(game)
  }, [game])

  // Step the animation; apply the move once the piece reaches the end of its path.
  useEffect(() => {
    if (!animation) return
    const id = setTimeout(() => {
      if (animation.step + 1 < animation.path.length) {
        setAnimation({ ...animation, step: animation.step + 1 })
      } else {
        setAnimation(undefined)
        setGame(animation.next)
      }
    }, timing.step)
    return () => clearTimeout(id)
  }, [animation])

  // Computer seats roll and move by themselves.
  useEffect(() => {
    if (busy || game.status !== 'playing') return
    if (game.pendingRoll === undefined) {
      if (seatOf(game.turn) !== 'computer') return
      const id = setTimeout(roll, timing.botRoll)
      return () => clearTimeout(id)
    }
    if (mover && seatOf(mover) === 'computer') {
      const id = setTimeout(() => play(chooseMove(game, random)!), timing.botMove)
      return () => clearTimeout(id)
    }
    // A human with a single legal move has nothing to choose: play it after a short beat.
    const only = legalMoves(game)
    if (only.length === 1) {
      const id = setTimeout(() => play(only[0]), timing.botMove)
      return () => clearTimeout(id)
    }
  }, [game, busy])

  // Numbered on the board in this order, so keep it by piece index.
  const movable = humanToMove
    ? moves
        .map((m) => m.piece)
        .filter((p, i, all) => all.findIndex((q) => samePiece(p, q)) === i)
        .sort((a, b) => a.index - b.index)
    : []
  // Nothing selected shows every movable piece's targets at once.
  const targets = !humanToMove ? [] : selected ? moves.filter((m) => samePiece(m.piece, selected)) : moves
  // Rolling: the 6s so far. Playing: the pending roll (at currentIndex) then the queued ones.
  const turnRolls = game.pendingRoll === undefined ? game.queuedRolls : [game.pendingRoll, ...game.queuedRolls]
  const currentIndex = game.pendingRoll === undefined ? undefined : 0
  const canStop = humanToRoll && game.queuedRolls.length > 0
  const moving: Moving | undefined = animation && { piece: animation.piece, at: animation.path[animation.step] }

  return {
    game,
    moving,
    movable,
    selected,
    targets,
    turnRolls,
    currentIndex,
    canStop,
    lastRoll,
    rolling,
    rollingTo,
    message,
    humanToRoll,
    humanToMove,
    roll,
    stop,
    select,
    deselect,
    play,
  }
}
