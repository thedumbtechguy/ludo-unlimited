import { useRef, type RefObject } from 'react'
import { BOARD_SIZE, boardToScreen, turnPoint, type Point } from '../layout'
import { COLOR_HEX } from '../theme'
import { effectActions, type FxAction } from './actions'
import { useFx, type Fx } from './FxLayer'
import { lightning, shakeFrames } from './geometry'
import { smoke, spark, speedLine } from './makers'
import { hex } from './particles'
import { useEffectStream, type EffectEvent } from './stream'

const WHITE = hex('#ffffff')
/** One square, in board units. */
const CELL_UNITS = 40

/** Where the board is on screen right now, and how to put board points there. */
type Stage = { area: HTMLElement; board: Element; turn: number; toScreen: (p: Point) => Point; u: number }

function stageOf(area: HTMLElement | null, board: Element | null | undefined, turn: number): Stage | undefined {
  if (!area || !board) return undefined
  const rect = board.getBoundingClientRect()
  if (rect.width === 0) return undefined
  return { area, board, turn, toScreen: (p) => boardToScreen(p, rect, turn), u: rect.width / BOARD_SIZE }
}

function run(action: FxAction, fx: Fx, stage: Stage): void {
  const { toScreen, u } = stage
  switch (action.type) {
    case 'flash': {
      const { x, y } = toScreen(action.at)
      fx.mark({ kind: 'ring', x, y, from: 10 * u, to: 48 * u, width: 7 * u, rgb: WHITE, edge: hex(COLOR_HEX[action.color]), delay: 0, duration: 0.3 })
      return
    }
    case 'sparks': {
      const { x, y } = toScreen(action.at)
      fx.burst(x, y, action.count, spark(COLOR_HEX[action.color], u))
      return
    }
    case 'shake': {
      const frames = shakeFrames(action.px, 9, Math.random).map(({ x, y }) => ({ transform: `translate(${x}px, ${y}px)` }))
      stage.area.animate(frames, { duration: action.ms, easing: 'linear' })
      return
    }
    case 'whip': {
      // The direction it moved, on screen, then a lunge on past the square and back.
      const a = toScreen(action.from)
      const b = toScreen(action.at)
      const length = Math.hypot(b.x - a.x, b.y - a.y) || 1
      const [dx, dy] = [(b.x - a.x) / length, (b.y - a.y) / length]
      fx.burst(b.x, b.y, action.count, speedLine(dx, dy, u))
      const from = turnPoint(action.from, stage.turn)
      const to = turnPoint(action.at, stage.turn)
      const [bx, by] = [(to.x - from.x) / CELL_UNITS, (to.y - from.y) / CELL_UNITS]
      stage.board
        .querySelector(`[data-piece="${action.kicker.color}-${action.kicker.index}"]`)
        ?.animate([{ translate: '0 0' }, { translate: `${bx * 12}px ${by * 12}px`, offset: 0.3 }, { translate: '0 0' }], {
          duration: 260,
          easing: 'cubic-bezier(.2,.8,.3,1)',
        })
      return
    }
    case 'bolt': {
      const a = toScreen(action.from)
      const b = toScreen(action.to)
      const paths = [0, 1, 2].map(() => lightning(a, b, 9, 0.12, Math.random))
      fx.mark({ kind: 'bolt', paths, width: 3 * u, rgb: WHITE, edge: hex(COLOR_HEX[action.color]), delay: 0, duration: 0.25 })
      return
    }
    case 'ripple': {
      const edge = hex(COLOR_HEX[action.color])
      action.squares.forEach((square, i) => {
        const { x, y } = toScreen(square)
        fx.mark({ kind: 'ring', x, y, from: 6 * u, to: 30 * u, width: 6 * u, rgb: WHITE, edge, delay: 0.06 + i * 0.055, duration: 0.32 })
      })
      return
    }
    case 'smoke': {
      const { x, y } = toScreen(action.at)
      fx.burst(x, y, action.count, smoke(u))
      return
    }
  }
}

/**
 * Plays each game effect over the board: particles and marks on the effects layer, the shake on the
 * play area (`area`, which holds the board). Goes inside the Board, as its overlay. Nothing at all
 * while effects are off.
 */
export function BoardFx({ effects, turn, area }: { effects: EffectEvent[]; turn: number; area: RefObject<HTMLElement> }) {
  const fx = useFx()
  const overlay = useRef<SVGSVGElement>(null)
  useEffectStream(effects, (effect) => {
    if (!fx.enabled) return
    const stage = stageOf(area.current, overlay.current?.parentElement, turn)
    if (!stage) return
    for (const action of effectActions(effect, fx.level)) run(action, fx, stage)
  })
  if (!fx.enabled) return null
  return <svg ref={overlay} className="board-fx" viewBox={`0 0 ${BOARD_SIZE} ${BOARD_SIZE}`} aria-hidden="true" />
}
