import { posKey, positionOf, type Color, type GameState } from '@ludo/engine'
import { useEffect, useRef, useState, type RefObject } from 'react'
import { BOARD_SIZE, boardToScreen, placements, turnPoint, type Point } from '../layout'
import { COLOR_HEX } from '../theme'
import { effectActions, yardCentre, type FxAction } from './actions'
import { CHAIN_REACH, chainLinks } from './chains'
import { useFx, type Fx } from './FxLayer'
import { lightning, shakeFrames } from './geometry'
import { confetti, pop, rocket, shard, shell, smoke, spark, sparkle, speedLine } from './makers'
import { hex } from './particles'
import { useEffectStream, type EffectEvent } from './stream'

const WHITE = hex('#ffffff')
/** One square, in board units. */
const CELL_UNITS = 40

/** Where the board is on screen right now, and how to put board points there. */
type Stage = { area: HTMLElement; board: Element; rect: DOMRect; turn: number; toScreen: (p: Point) => Point; u: number }

function stageOf(area: HTMLElement | null, board: Element | null | undefined, turn: number): Stage | undefined {
  if (!area || !board) return undefined
  const rect = board.getBoundingClientRect()
  if (rect.width === 0) return undefined
  return { area, board, rect, turn, toScreen: (p) => boardToScreen(p, rect, turn), u: rect.width / BOARD_SIZE }
}

/** How long a fountain keeps spouting. */
const FOUNTAIN_S = 0.38
/** How long the block shimmer takes to sweep across. */
export const SHIMMER_MS = 520

/** A shimmer sweeping over a block's pieces, at their (turned) board points. */
type Shimmer = { id: number; points: Point[] }

/** Runs something after a delay, unless the board has gone by then. */
type Later = (fn: () => void, ms: number) => void

/** Who each Labourer victim works for, as last drawn: the chains' colour, still known once freed. */
type Owners = GameState['labourers']

/** Where the win's rockets go up from (across the board's width) and when, in seconds. */
const LAUNCHES = [
  { x: 0.28, top: 0.22, at: 0 },
  { x: 0.72, top: 0.3, at: 0.28 },
  { x: 0.5, top: 0.16, at: 0.52 },
]
const PLAYER_COLORS = Object.values(COLOR_HEX)

function run(action: Exclude<FxAction, { type: 'chains' | 'shimmer' }>, fx: Fx, stage: Stage, owners: Owners, later: Later): void {
  const { toScreen, u, rect } = stage
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
      const owner = owners[action.victim]
      if (owner) fx.burst(x, y, action.count, shard(COLOR_HEX[owner], CHAIN_REACH * u, u))
      return
    }
    case 'fountain': {
      const at = toScreen(action.at)
      const handle = fx.emitter({ rate: action.count / FOUNTAIN_S, at: () => at, make: sparkle(COLOR_HEX[action.color], u) })
      setTimeout(handle.stop, FOUNTAIN_S * 1000)
      return
    }
    case 'burst': {
      const { x, y } = toScreen(action.at)
      fx.burst(x, y, action.count, pop(COLOR_HEX[action.color], u))
      return
    }
    case 'fireworks': {
      // Up from the bottom edge to bursts over the upper board, one after another.
      LAUNCHES.slice(0, action.rockets).forEach(({ x, top, at }) => {
        const from = { x: rect.left + rect.width * x, y: rect.bottom }
        const rise = rect.height * (1 - top)
        const make = rocket(rise, 0.5, u, shell(COLOR_HEX[action.color], u), action.count)
        later(() => fx.burst(from.x, from.y, 1, make), at * 1000)
      })
      return
    }
    case 'confetti': {
      const make = confetti(PLAYER_COLORS, rect.width, u)
      later(() => fx.burst(rect.left + rect.width / 2, rect.top, action.count, make), 120)
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
export function BoardFx({ effects, state, turn, area }: { effects: EffectEvent[]; state: GameState; turn: number; area: RefObject<HTMLElement> }) {
  const fx = useFx()
  const svg = useRef<SVGSVGElement>(null)
  // Labourers that started while we watched slam on; ones already running (a resumed game) are just there.
  const [slammed, setSlammed] = useState<Partial<Record<Color, number>>>({})
  const [shimmers, setShimmers] = useState<Shimmer[]>([])
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])
  useEffect(() => () => timers.current.forEach(clearTimeout), [])
  const owners = useRef<Owners>(state.labourers)
  const later: Later = (fn, ms) => {
    timers.current.push(setTimeout(fn, ms))
  }

  useEffectStream(effects, (effect) => {
    if (!fx.enabled) return
    const stage = stageOf(area.current, svg.current?.parentElement, turn)
    for (const action of effectActions(effect, fx.level, state)) {
      if (action.type === 'chains') {
        setSlammed((s) => ({ ...s, [action.victim]: action.id }))
      } else if (action.type === 'shimmer') {
        // The block's pieces where they're drawn now, fanned out as a stack.
        const key = posKey(action.at)
        const points = placements(state)
          .filter(({ piece }) => piece.color === action.color && posKey(positionOf(state, piece)) === key)
          .map((p) => turnPoint(p.point, turn))
        const { id } = action
        setShimmers((s) => [...s, { id, points }])
        later(() => setShimmers((s) => s.filter((x) => x.id !== id)), SHIMMER_MS + 80)
      } else if (stage) {
        run(action, fx, stage, owners.current, later)
      }
    }
  })
  // After the effects above, so a Labourer freed in this render still finds its owner.
  useEffect(() => {
    owners.current = state.labourers
  }, [state.labourers])
  if (!fx.enabled) return null
  const entrance = fx.level === 'full' ? 'slam' : 'fade'
  return (
    <svg ref={svg} className="board-fx" viewBox={`0 0 ${BOARD_SIZE} ${BOARD_SIZE}`} aria-hidden="true">
      {shimmers.map((shimmer) => (
        <BlockShimmer key={shimmer.id} {...shimmer} />
      ))}
      {(Object.keys(state.labourers) as Color[]).map((victim) => (
        <Chains
          key={`${victim}-${slammed[victim] ?? 0}`}
          victim={victim}
          owner={state.labourers[victim]!}
          turn={turn}
          entrance={slammed[victim] ? entrance : undefined}
        />
      ))}
    </svg>
  )
}

/**
 * Two chains crossed over a Labourer's yard in the owner's colour, each link outlined in white so
 * they read on any yard, held faint while it lasts.
 */
function Chains({ victim, owner, turn, entrance }: { victim: Color; owner: Color; turn: number; entrance?: 'slam' | 'fade' }) {
  const centre = turnPoint(yardCentre(victim), turn)
  return (
    <g
      data-testid={`chains-${victim}`}
      className={entrance ? `chains ${entrance}` : 'chains'}
      style={{ color: COLOR_HEX[owner], transformOrigin: `${centre.x}px ${centre.y}px` }}
    >
      {/* White under the colour: every link first as a slightly fatter white outline. */}
      {(['outline', 'link'] as const).map((layer) => (
        <g key={layer} stroke={layer === 'outline' ? '#ffffff' : 'currentColor'}>
          {chainLinks(centre).map(({ x, y, angle, flat }, i) =>
            flat ? (
              <rect key={i} x={x - 10} y={y - 6} width="20" height="12" rx="6" fill="none" strokeWidth={layer === 'outline' ? 6.4 : 3.6} transform={`rotate(${angle} ${x} ${y})`} />
            ) : (
              <rect
                key={i}
                x={x - 9}
                y={y - 2.2}
                width="18"
                height="4.4"
                rx="2.2"
                fill={layer === 'outline' ? '#ffffff' : 'currentColor'}
                strokeWidth={layer === 'outline' ? 2.8 : 0}
                transform={`rotate(${angle} ${x} ${y})`}
              />
            ),
          )}
        </g>
      ))}
    </g>
  )
}

/** A bright band sweeping once across the stacked pieces of a new block, clipped to the pieces. */
function BlockShimmer({ id, points }: Shimmer) {
  if (points.length === 0) return null
  const cx = points.reduce((sum, p) => sum + p.x, 0) / points.length
  const cy = points.reduce((sum, p) => sum + p.y, 0) / points.length
  return (
    <g data-testid="shimmer">
      <clipPath id={`shimmer-${id}`}>
        {points.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r="17" />
        ))}
      </clipPath>
      <g clipPath={`url(#shimmer-${id})`}>
        <g transform={`translate(${cx} ${cy}) rotate(25)`}>
          <g className="shimmer-band">
            <rect x="-9" y="-40" width="18" height="80" fill="#ffffff" />
            <rect x="13" y="-40" width="5" height="80" fill="#ffffff" />
          </g>
        </g>
      </g>
    </g>
  )
}
