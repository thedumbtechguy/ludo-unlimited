import type { Color, GameState } from '@ludo/engine'
import { useRef, useState, type RefObject } from 'react'
import { BOARD_SIZE, boardToScreen, turnPoint, type Point } from '../layout'
import { COLOR_HEX } from '../theme'
import { effectActions, yardCentre, type FxAction } from './actions'
import { CHAIN_REACH, chainLinks } from './chains'
import { useFx, type Fx } from './FxLayer'
import { lightning, shakeFrames } from './geometry'
import { shard, smoke, spark, speedLine } from './makers'
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

/** What the overlay shows besides particles: which yards' chains have just slammed on. */
type Overlay = { chains: (victim: Color, id: number) => void }

function run(action: Exclude<FxAction, { type: 'chains' }>, fx: Fx, stage: Stage): void {
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
      // Short hops across a lane: few, sharp kinks, drawn heavy so the zap reads at phone size.
      const paths = [0, 1, 2].map(() => lightning(a, b, 7, 0.26, Math.random))
      fx.mark({ kind: 'bolt', paths, width: 5.5 * u, rgb: WHITE, edge: hex(COLOR_HEX[action.color]), delay: 0, duration: 0.25 })
      fx.burst(a.x, a.y, 10, spark(COLOR_HEX[action.color], u * 0.7))
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
    case 'shatter': {
      const { x, y } = toScreen(yardCentre(action.victim))
      fx.burst(x, y, action.count, shard(CHAIN_REACH * u, u))
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
export function BoardFx({
  effects,
  labourers,
  turn,
  area,
}: {
  effects: EffectEvent[]
  labourers: GameState['labourers']
  turn: number
  area: RefObject<HTMLElement>
}) {
  const fx = useFx()
  const svg = useRef<SVGSVGElement>(null)
  // Labourers that started while we watched slam on; ones already running (a resumed game) are just there.
  const [slammed, setSlammed] = useState<Partial<Record<Color, number>>>({})
  const overlay: Overlay = { chains: (victim, id) => setSlammed((s) => ({ ...s, [victim]: id })) }
  useEffectStream(effects, (effect) => {
    if (!fx.enabled) return
    const stage = stageOf(area.current, svg.current?.parentElement, turn)
    for (const action of effectActions(effect, fx.level)) {
      if (action.type === 'chains') overlay.chains(action.victim, action.id)
      else if (stage) run(action, fx, stage)
    }
  })
  if (!fx.enabled) return null
  const entrance = fx.level === 'full' ? 'slam' : 'fade'
  return (
    <svg ref={svg} className="board-fx" viewBox={`0 0 ${BOARD_SIZE} ${BOARD_SIZE}`} aria-hidden="true">
      {(Object.keys(labourers) as Color[]).map((victim) => (
        <Chains key={`${victim}-${slammed[victim] ?? 0}`} victim={victim} turn={turn} entrance={slammed[victim] ? entrance : undefined} />
      ))}
    </svg>
  )
}

/** Two dark chains crossed over a Labourer's yard, held faint while it lasts. */
function Chains({ victim, turn, entrance }: { victim: Color; turn: number; entrance?: 'slam' | 'fade' }) {
  const centre = turnPoint(yardCentre(victim), turn)
  return (
    <g data-testid={`chains-${victim}`} className={entrance ? `chains ${entrance}` : 'chains'} style={{ transformOrigin: `${centre.x}px ${centre.y}px` }}>
      {chainLinks(centre).map(({ x, y, angle, flat }, i) =>
        flat ? (
          <rect key={i} x={x - 10} y={y - 6} width="20" height="12" rx="6" fill="none" stroke="currentColor" strokeWidth="3.6" transform={`rotate(${angle} ${x} ${y})`} />
        ) : (
          <rect key={i} x={x - 9} y={y - 2.2} width="18" height="4.4" rx="2.2" fill="currentColor" transform={`rotate(${angle} ${x} ${y})`} />
        ),
      )}
    </g>
  )
}
