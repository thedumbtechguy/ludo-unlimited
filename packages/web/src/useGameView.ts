import {
  WICKED_DELAY,
  applyMove,
  currentMover,
  describeMove,
  describeRoll,
  legalMoves,
  movePath,
  pass,
  positionOf,
  roll as rollDice,
  stopRolling,
  type Color,
  type GameEffect,
  type GameEvent,
  type GameState,
  type Move,
  type PieceId,
  type Position,
  type Timing,
} from '@ludo/engine'
import { useEffect, useRef, useState } from 'react'
import { realChoices } from './choices'
import { playSound, type SoundEvent } from './fx/sound'
import type { EffectEvent } from './fx/stream'
import { finishCallout, kickCallouts, kickMessage, type KickCalloutText, type Wasted } from './labels'
import type { Moving } from './layout'

/** What a person wants to do; the source (this device, or the room) turns it into a game event. */
export type Intent = { t: 'roll' } | { t: 'move'; move: Move } | { t: 'stop' }

export type ViewOptions = {
  initial: GameState
  timing: Timing
  /** Whether a person on this device makes this colour's decisions right now. */
  controls: (color: Color) => boolean
  /** The first person on this device, called "You". */
  you?: Color
  act: (intent: Intent) => void
  onChange?: (game: GameState) => void
}

/**
 * `effects` play, and a kick's `callouts` show, when the piece arrives. `fromBase`: the first square
 * is where it comes out of its yard.
 */
type Animation = {
  piece: PieceId
  path: Position[]
  step: number
  next: GameState
  effects: GameEffect[]
  callouts: CalloutText[]
  fromBase: boolean
}

const stepSound = ({ path, fromBase }: Animation, step: number): SoundEvent => ({
  type: 'pieceStep',
  entered: fromBase && step === 0,
  last: step === path.length - 1,
})

/** Enough recent effects for any listener a render or two behind. */
const KEPT_EFFECTS = 32

/** A kick or a finish to call out over the board; `id` tells one callout from the next. */
export type Callout = KickCalloutText & { id: number; color: Color }
type CalloutText = Omit<Callout, 'id'>

const samePiece = (a: PieceId, b: PieceId) => a.color === b.color && a.index === b.index

/** Shows a game: applies and animates its events, whatever their source, and turns a person's actions into intents. */
export function useGameView({ initial, timing, controls, you, act, onChange }: ViewOptions) {
  const [game, setGame] = useState(initial)
  const [animation, setAnimation] = useState<Animation>()
  const [selected, setSelected] = useState<PieceId>()
  const [lastRoll, setLastRoll] = useState<number>()
  const [message, setMessage] = useState<string>()
  // The last roll that had no move: shown until someone moves or rolls again.
  const [wasted, setWasted] = useState<Wasted>()
  const [callout, setCallout] = useState<Callout>()
  const [rollingTo, setRollingTo] = useState<number>()
  const rolling = rollingTo !== undefined
  const rollTimer = useRef<ReturnType<typeof setTimeout>>()
  const wickedTimer = useRef<ReturnType<typeof setTimeout>>()
  const [effects, setEffects] = useState<EffectEvent[]>([])
  const effectId = useRef(0)

  // Events wait here while a roll or move is still being shown.
  const queue = useRef<GameEvent[]>([])
  const [queued, setQueued] = useState(0)
  const busy = animation !== undefined || rolling || queued > 0

  useEffect(
    () => () => {
      clearTimeout(rollTimer.current)
      clearTimeout(wickedTimer.current)
    },
    [],
  )

  const mover = currentMover(game)
  const moves = busy ? [] : legalMoves(game)
  const humanToRoll = !busy && game.status === 'playing' && game.pendingRoll === undefined && controls(game.turn)
  const humanToMove = !busy && mover !== undefined && controls(mover)

  function enqueue(event: GameEvent) {
    queue.current.push(event)
    setQueued(queue.current.length)
  }

  function show(event: GameEvent) {
    switch (event.type) {
      case 'roll':
        return showRoll(event.value)
      case 'move':
        return showMove(event.move)
      case 'stop':
        return showStop()
      case 'pass':
        return setGame(pass(game))
    }
  }

  useEffect(() => {
    if (animation || rolling || queue.current.length === 0) return
    const event = queue.current.shift()!
    setQueued(queue.current.length)
    show(event)
  }, [animation, rolling, queued, game])

  /** Start over from `next` (a fresh game, or a resync), dropping anything in flight. */
  function reset(next: GameState) {
    clearTimeout(rollTimer.current)
    clearTimeout(wickedTimer.current)
    queue.current = []
    setQueued(0)
    setAnimation(undefined)
    setRollingTo(undefined)
    setSelected(undefined)
    setCallout(undefined)
    setWasted(undefined)
    setMessage(undefined)
    setGame(next)
  }

  function emit(list: GameEffect[]) {
    if (list.length === 0) return
    list.forEach(playSound)
    const events = list.map((effect) => ({ ...effect, id: ++effectId.current }))
    setEffects((prev) => [...prev, ...events].slice(-KEPT_EFFECTS))
  }

  function applyRoll(value: number) {
    const next = rollDice(game, value)
    emit(describeRoll(game, next))
    setLastRoll(value)
    // Still rolling after a 6 is not a wasted roll: the hint offers rolling again or stopping.
    const wasted = next.pendingRoll === undefined && next.queuedRolls.length === 0
    setMessage(undefined)
    setWasted(wasted ? { color: game.turn, value } : undefined)
    setGame(next)
  }

  function showStop() {
    const next = stopRolling(game)
    emit(describeRoll(game, next))
    setMessage(undefined)
    setWasted(next.pendingRoll === undefined ? { color: game.turn, value: 6 } : undefined)
    setGame(next)
  }

  function showRoll(value: number) {
    if (timing.roll === 0) return applyRoll(value)
    setRollingTo(value)
    playSound({ type: 'roll' })
    rollTimer.current = setTimeout(() => {
      setRollingTo(undefined)
      playSound({ type: 'diceLanded' })
      applyRoll(value)
    }, timing.roll)
  }

  function showMove(move: Move) {
    const next = applyMove(game, move)
    setSelected(undefined)
    setWasted(undefined)
    const landed = describeMove(game, move, next)
    // A move that gets a player's last piece home can't kick, so it's one or the other.
    const finish = finishCallout(landed, next, you)
    const callouts = finish ? [finish] : kickCallouts(move, game).map((text) => ({ ...text, color: move.piece.color }))
    setMessage(finish ? `${finish.title} ${finish.line}` : kickMessage(move))
    if (callouts.length === 0) setCallout(undefined)
    if (timing.step === 0) {
      land(landed, callouts)
      setGame(next)
    } else {
      // The callout lands with the kick, together with the flash and the kicked piece flying home.
      const fromBase = positionOf(game, move.piece).kind === 'base'
      const start: Animation = { piece: move.piece, path: movePath(game, move), step: 0, next, effects: landed, callouts, fromBase }
      playSound(stepSound(start, 0))
      setAnimation(start)
    }
  }

  /**
   * A move's effects and callouts as the piece lands: the kick's at once, then a wicked move's
   * "Wicked!", smoke and sound on top, a moment later (straight away with no animation).
   */
  function land(effects: GameEffect[], [kick, wicked]: CalloutText[]) {
    if (kick) showCallout(kick)
    emit(effects.filter((e) => e.type !== 'wicked'))
    const onTop = effects.filter((e) => e.type === 'wicked')
    if (onTop.length === 0) return
    const later = () => {
      if (wicked) showCallout(wicked)
      emit(onTop)
    }
    if (timing.step === 0) later()
    else wickedTimer.current = setTimeout(later, WICKED_DELAY)
  }

  function showCallout(text?: CalloutText) {
    setCallout((last) => (text ? { id: (last?.id ?? 0) + 1, ...text } : undefined))
  }

  const roll = () => act({ t: 'roll' })
  const stop = () => act({ t: 'stop' })

  function play(move: Move) {
    setSelected(undefined)
    act({ t: 'move', move })
  }

  function select(piece: PieceId) {
    const own = moves.filter((m) => samePiece(m.piece, piece))
    if (own.length === 1) play(own[0])
    else setSelected(piece)
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
        playSound(stepSound(animation, animation.step + 1))
        setAnimation({ ...animation, step: animation.step + 1 })
      } else {
        setAnimation(undefined)
        land(animation.effects, animation.callouts)
        setGame(animation.next)
      }
    }, timing.step)
    return () => clearTimeout(id)
  }, [animation])

  // A person with a single real choice has nothing to choose: it plays after a short beat.
  useEffect(() => {
    if (!humanToMove) return
    const only = realChoices(legalMoves(game))
    if (only.length !== 1) return
    const id = setTimeout(() => play(only[0]), timing.botMove)
    return () => clearTimeout(id)
  }, [game, humanToMove])

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
    wasted,
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
    callout,
    effects,
    humanToRoll,
    humanToMove,
    busy,
    controls,
    roll,
    stop,
    select,
    deselect,
    play,
    enqueue,
    reset,
  }
}
