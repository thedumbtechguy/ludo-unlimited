import { useRef, type RefObject } from 'react'
import { BOARD_SIZE, boardToScreen, type Point } from '../layout'
import { COLOR_HEX } from '../theme'
import { effectActions, type FxAction } from './actions'
import { useFx, type Fx } from './FxLayer'
import { shakeFrames } from './geometry'
import { spark } from './makers'
import { hex } from './particles'
import { useEffectStream, type EffectEvent } from './stream'

const WHITE = hex('#ffffff')

/** Where the board is on screen right now, and how to put board points there. */
type Stage = { area: HTMLElement; board: Element; toScreen: (p: Point) => Point; u: number }

function stageOf(area: HTMLElement | null, board: Element | null | undefined, turn: number): Stage | undefined {
  if (!area || !board) return undefined
  const rect = board.getBoundingClientRect()
  if (rect.width === 0) return undefined
  return { area, board, toScreen: (p) => boardToScreen(p, rect, turn), u: rect.width / BOARD_SIZE }
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
