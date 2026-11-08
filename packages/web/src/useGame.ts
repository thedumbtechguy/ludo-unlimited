import {
  applyMove,
  chooseMove,
  createGame,
  currentMover,
  legalMoves,
  movePath,
  replay,
  roll as rollDice,
  type Color,
  type GameEvent,
  type GameState,
  type Move,
  type PieceId,
  type Position,
  type Settings,
} from '@ludo/engine'
import { useEffect, useState } from 'react'
import type { Dice } from './dice'
import { kickMessage } from './labels'
import type { Moving } from './layout'
import type { Seats } from './types'

export type Timing = { botRoll: number; botMove: number; step: number }
export const NORMAL_TIMING: Timing = { botRoll: 600, botMove: 400, step: 120 }
export const FAST_TIMING: Timing = { botRoll: 0, botMove: 0, step: 0 }

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

  const seatOf = (color: Color) => seats[color] ?? 'computer'
  const busy = animation !== undefined
  const mover = currentMover(game)
  const moves = busy ? [] : legalMoves(game)
  const humanToRoll = !busy && game.status === 'playing' && game.pendingRoll === undefined && seatOf(game.turn) === 'human'
  const humanToMove = !busy && mover !== undefined && seatOf(mover) === 'human'

  function roll() {
    const value = dice()
    const next = rollDice(game, value)
    setLastRoll(value)
    setMessage(next.pendingRoll === undefined ? 'No moves' : undefined)
    setGame(next)
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
  }, [game, busy])

  const movable = humanToMove ? moves.map((m) => m.piece).filter((p, i, all) => all.findIndex((q) => samePiece(p, q)) === i) : []
  const targets = humanToMove && selected ? moves.filter((m) => samePiece(m.piece, selected)) : []
  const moving: Moving | undefined = animation && { piece: animation.piece, at: animation.path[animation.step] }

  return { game, moving, movable, selected, targets, lastRoll, message, humanToRoll, humanToMove, roll, select, deselect, play }
}
