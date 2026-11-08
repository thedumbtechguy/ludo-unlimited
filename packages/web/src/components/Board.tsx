import { COLORS, posKey, positionOf, type Color, type GameState, type Move, type PieceId } from '@ludo/engine'
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { anchor } from '../fx/fire'
import { useFx, type Fx } from '../fx/FxLayer'
import { arcFrames } from '../fx/geometry'
import { trail } from '../fx/makers'
import { BOARD_SIZE, CELL, TILES, placements, positionPoint, turnPoint, yardOrigin, type Moving, type Point } from '../layout'
import {
  COLOR_NAME,
  combinedRolls,
  listNumbers,
  ORDINAL,
  numberedPieceLabel,
  numberedTargetLabel,
  pieceLabel,
  placeName,
  targetAction,
  targetLabel,
  turnTag,
} from '../labels'
import { BOARD_BG, COLOR_HEX, INK, KICK_MARK, MOVE_MARK, ON_COLOR, TAG_TEXT, TILE } from '../theme'

export type BoardProps = {
  state: GameState
  moving?: Moving
  movable?: PieceId[]
  selected?: PieceId
  targets?: Move[]
  onSelectPiece?: (piece: PieceId) => void
  onPickTarget?: (move: Move) => void
  onDeselect?: () => void
  /** The target being hovered or focused, or undefined when it is left. */
  onPreview?: (move?: Move) => void
  /** Clockwise quarter turns: the whole board, pieces and buttons turn together; text stays upright. */
  turn?: number
  /** The name painted on each seated player's yard; no names, no yard labels. */
  names?: Partial<Record<Color, string>>
  /** The first human seat, whose turn tag reads "Your turn". */
  you?: Color
  /** Whose yard is tagged and outlined as taking the turn. */
  active?: Color
  /** Drawn over everything, in board units (e.g. the kick callout). */
  children?: ReactNode
}

/** Every target move landing on one square. */
type Destination = { key: string; point: Point; moves: Move[] }

function destinations(targets: Move[], turn: number): Destination[] {
  const byKey = new Map<string, Destination>()
  for (const move of targets) {
    const key = posKey(move.to)
    const existing = byKey.get(key)
    if (existing) existing.moves.push(move)
    else byKey.set(key, { key, point: turnPoint(positionPoint(move.to, move.piece), turn), moves: [move] })
  }
  return [...byKey.values()]
}

/** The move whose rolls to show while a destination is previewed: the one using the most. */
const widest = (moves: Move[]) => moves.reduce((a, b) => ((b.rolls ?? 1) > (a.rolls ?? 1) ? b : a))

const samePiece = (a: PieceId, b?: PieceId) => b !== undefined && a.color === b.color && a.index === b.index
const pct = (v: number) => `${(v / BOARD_SIZE) * 100}%`

/** Below the square, or above it near the bottom edge; nudged inwards near the sides. */
function chooserPlacement({ x, y }: Point) {
  const below = y < BOARD_SIZE - 140
  const shiftX = x < 140 ? '-20%' : x > BOARD_SIZE - 140 ? '-80%' : '-50%'
  return {
    left: pct(x),
    top: pct(below ? y + 26 : y - 26),
    transform: `translate(${shiftX}, ${below ? '0' : '-100%'})`,
  }
}

const CENTER: [Color, Point[]][] = [
  ['green', [{ x: 240, y: 240 }, { x: 360, y: 240 }, { x: 300, y: 300 }]],
  ['yellow', [{ x: 360, y: 240 }, { x: 360, y: 360 }, { x: 300, y: 300 }]],
  ['blue', [{ x: 240, y: 360 }, { x: 360, y: 360 }, { x: 300, y: 300 }]],
  ['red', [{ x: 240, y: 240 }, { x: 240, y: 360 }, { x: 300, y: 300 }]],
]

const YARD = 240

/** How long a kicked piece takes to fly back to its yard. */
export const FLIGHT_MS = 450
const FLIGHT_FRAMES = 16

const pieceKey = (piece: PieceId) => `${piece.color}-${piece.index}`

/** Pieces that were out on the board in `before` and are back in their yard in `after`: kicked. */
export function kickedHome(before: GameState, after: GameState): PieceId[] {
  return after.players.flatMap((player, p) =>
    player.pieces.flatMap((pos, index) =>
      pos.kind === 'base' && before.players[p].pieces[index].kind !== 'base' ? [{ color: player.color, index }] : [],
    ),
  )
}

/**
 * Throws each kicked piece back to its yard along an arc, growing as it rises, with a short trail
 * on the effects layer. The piece is already drawn in its yard; the animation plays over that.
 */
function flyHome(svg: SVGSVGElement, before: GameState, after: GameState, turn: number, fx: Fx): void {
  const kicked = kickedHome(before, after)
  if (kicked.length === 0) return
  const pointIn = (state: GameState, piece: PieceId) => turnPoint(placements(state).find((p) => samePiece(p.piece, piece))!.point, turn)
  for (const piece of kicked) {
    const el = svg.querySelector<SVGGElement>(`[data-piece="${pieceKey(piece)}"]`)
    if (!el) continue
    const frames = arcFrames(pointIn(before, piece), pointIn(after, piece), FLIGHT_FRAMES).map(({ x, y, scale }) => ({
      transform: `translate(${x}px, ${y}px) scale(${scale})`,
    }))
    el.animate(frames, { duration: FLIGHT_MS, easing: 'linear' })
    const u = svg.getBoundingClientRect().width / BOARD_SIZE
    const body = el.querySelector('.body')
    const tail = fx.emitter({ rate: 110, at: () => anchor(body, 0.5), make: trail(COLOR_HEX[piece.color], u) })
    setTimeout(tail.stop, FLIGHT_MS - 60)
  }
}

/** The top-left corner of a box of `size` whose unturned top-left is `at`, once the board is turned. */
const turnedBox = (at: Point, size: number, turn: number): Point => {
  const c = turnPoint({ x: at.x + size / 2, y: at.y + size / 2 }, turn)
  return { x: c.x - size / 2, y: c.y - size / 2 }
}

export function Board({
  state,
  moving,
  movable = [],
  selected,
  targets = [],
  onSelectPiece,
  onPickTarget,
  onDeselect,
  onPreview,
  turn = 0,
  names,
  you,
  active,
  children,
}: BoardProps) {
  const fx = useFx()
  const svg = useRef<SVGSVGElement>(null)
  const shown = useRef(state)
  useLayoutEffect(() => {
    const before = shown.current
    shown.current = state
    if (fx.enabled && before !== state && svg.current) flyHome(svg.current, before, state, turn, fx)
  }, [state])

  const pieces = placements(state, moving).map((p) => ({ ...p, point: turnPoint(p.point, turn) }))
  const pointOf = (piece: PieceId) => pieces.find((p) => samePiece(p.piece, piece))!.point
  const yardAt = (color: Color) => turnedBox(yardOrigin(color), YARD, turn)
  // With 2+ movable pieces and none selected, number them so each destination can say whose it is.
  const numbered = !selected && movable.length > 1
  const numberOf = (piece: PieceId) => movable.findIndex((m) => samePiece(m, piece)) + 1
  const spots = destinations(targets, turn)
  const movableSquares = new Set(movable.map((piece) => posKey(positionOf(state, piece))))

  // The open chooser for a square several moves share; closed whenever the game moves on.
  const [choosing, setChoosing] = useState<string>()
  useEffect(() => setChoosing(undefined), [state])
  const chooser = spots.find((d) => d.key === choosing && d.moves.length > 1)

  const pick = (move: Move) => {
    setChoosing(undefined)
    onPreview?.(undefined)
    onPickTarget?.(move)
  }
  const labelFor = (move: Move) => {
    const rolls = combinedRolls(state, move)
    return numbered ? numberedTargetLabel(numberOf(move.piece), move, rolls) : targetLabel(move, rolls)
  }
  const previewProps = (move: Move) => ({
    onMouseEnter: () => onPreview?.(move),
    onFocus: () => onPreview?.(move),
    onMouseLeave: () => onPreview?.(undefined),
    onBlur: () => onPreview?.(undefined),
  })

  return (
    <div
      className="board"
      onClick={() => {
        setChoosing(undefined)
        onDeselect?.()
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') setChoosing(undefined)
      }}
    >
      <svg ref={svg} viewBox={`0 0 ${BOARD_SIZE} ${BOARD_SIZE}`} aria-hidden="true">
        <defs>
          <filter id="piece-shadow" x="-50%" y="-50%" width="200%" height="200%">
            <feDropShadow dx="0" dy="3" stdDeviation="3" floodColor="#0f172a" floodOpacity="0.35" />
          </filter>
        </defs>
        <rect width={BOARD_SIZE} height={BOARD_SIZE} rx="16" fill={BOARD_BG} />
        {COLORS.map((color) => {
          const o = yardAt(color)
          return (
            <g key={color}>
              <rect data-testid="yard" data-color={color} x={o.x + 4} y={o.y + 4} width="232" height="232" rx="24" fill={COLOR_HEX[color]} />
              <rect x={o.x + 40} y={o.y + 40} width="160" height="160" rx="20" fill={TILE} />
              {color === active && (
                <rect data-testid="active-yard" data-color={color} x={o.x + 6.5} y={o.y + 6.5} width="227" height="227" rx="21.5" fill="none" stroke="#ffffff" strokeWidth="5" />
              )}
            </g>
          )
        })}
        {TILES.map((tile, i) => {
          const t = turnedBox(tile, CELL, turn)
          return (
            <rect
              key={i}
              data-testid="tile"
              x={t.x + 1}
              y={t.y + 1}
              width={CELL - 2}
              height={CELL - 2}
              rx="8"
              fill={tile.fill ? COLOR_HEX[tile.fill] : TILE}
            />
          )
        })}
        {CENTER.map(([color, points]) => (
          <polygon
            key={color}
            points={points.map((p) => turnPoint(p, turn)).map(({ x, y }) => `${x},${y}`).join(' ')}
            fill={COLOR_HEX[color]}
          />
        ))}
        {pieces.map(({ piece, point, stack, top }) => {
          const isMovable = movable.some((m) => samePiece(m, piece))
          return (
            <g
              key={pieceKey(piece)}
              data-testid="piece"
              data-piece={pieceKey(piece)}
              className={isMovable ? 'piece movable' : 'piece'}
              style={{ transform: `translate(${point.x}px, ${point.y}px)` }}
            >
              <circle className="body" r="15" fill={COLOR_HEX[piece.color]} stroke="#ffffff" strokeWidth="4" filter="url(#piece-shadow)" />
              {samePiece(piece, selected) && <circle r="21" fill="none" stroke={INK} strokeWidth="3" />}
              {stack > 1 && top && (
                <g transform="translate(13 -13)">
                  <circle r="9" fill={INK} />
                  <text textAnchor="middle" dy="4" fontSize="11" fontWeight="700" fill="#ffffff">
                    {stack}
                  </text>
                </g>
              )}
            </g>
          )
        })}
        {spots.map(({ key, point, moves }) => {
          const color = moves.some((m) => m.kick) ? KICK_MARK : MOVE_MARK
          const numbers = numbered ? moves.map((m) => numberOf(m.piece)).join('·') : ''
          const rolls = moves.length === 1 ? combinedRolls(state, moves[0]) : undefined
          return (
            <g key={key} pointerEvents="none">
              <circle
                data-testid="target-marker"
                pointerEvents="none"
                cx={point.x}
                cy={point.y}
                r="22"
                fill="none"
                stroke={color}
                strokeWidth="4"
                strokeDasharray="6 4"
              />
              {numbers && (
                <g transform={`translate(${point.x} ${point.y})`}>
                  <rect x={-6 - numbers.length * 4.5} y="-11" width={12 + numbers.length * 9} height="22" rx="11" fill={color} stroke="#ffffff" strokeWidth="2" />
                  <text data-testid="target-number" textAnchor="middle" dy="5" fontSize="14" fontWeight="800" fill="#ffffff">
                    {numbers}
                  </text>
                </g>
              )}
              {rolls && (
                // Under the marker, or above it on the bottom row, where it would hang off the board.
                <g transform={`translate(${point.x} ${point.y + 32 > BOARD_SIZE ? point.y - 24 : point.y + 24})`}>
                  <rect x={-4 - rolls.length * 3.5} y="-8" width={8 + rolls.length * 7} height="16" rx="8" fill={INK} />
                  <text data-testid="target-rolls" textAnchor="middle" dy="3.5" fontSize="11" fontWeight="700" fill="#ffffff">
                    {rolls}
                  </text>
                </g>
              )}
            </g>
          )
        })}
        {/* Piece numbers sit above the target rings, so a piece another piece can move onto keeps its number. */}
        {numbered &&
          movable.map((piece) => {
            const p = pointOf(piece)
            return (
              <g key={`number-${piece.index}`} transform={`translate(${p.x - 15} ${p.y - 15})`} pointerEvents="none">
                <circle r="10" fill="#ffffff" stroke={INK} strokeWidth="2" />
                <text data-testid="piece-number" textAnchor="middle" dy="4.5" fontSize="13" fontWeight="800" fill={INK}>
                  {numberOf(piece)}
                </text>
              </g>
            )
          })}
      </svg>

      {(selected ? [selected] : movable).map((piece) => {
        const p = pointOf(piece)
        const pos = positionOf(state, piece)
        return (
          <button
            key={`piece-${piece.color}-${piece.index}`}
            type="button"
            className="hit"
            style={{ left: pct(p.x), top: pct(p.y) }}
            aria-label={numbered ? numberedPieceLabel(numberOf(piece), piece, pos) : pieceLabel(piece, pos)}
            aria-pressed={samePiece(piece, selected)}
            onClick={(e) => {
              e.stopPropagation()
              onSelectPiece?.(piece)
            }}
          />
        )
      })}
      {/*
        After the pieces, so a destination wins where it overlaps a nearby piece. A destination on a
        square holding another movable piece gets no button: a tap there means that piece. Selecting
        the moving piece first shows its destinations alone, and they are tappable.
      */}
      {spots.filter(({ key }) => selected || !movableSquares.has(key)).map(({ key, point, moves }) => {
        const shared = moves.length > 1
        return (
          <button
            key={`target-${key}`}
            type="button"
            className="hit"
            style={{ left: pct(point.x), top: pct(point.y) }}
            aria-label={
              shared
                ? `Pieces ${listNumbers(moves.map((m) => numberOf(m.piece)))} can reach ${placeName(moves[0].to)}: choose one`
                : labelFor(moves[0])
            }
            aria-expanded={shared ? choosing === key : undefined}
            {...previewProps(widest(moves))}
            onClick={(e) => {
              e.stopPropagation()
              if (shared) setChoosing(choosing === key ? undefined : key)
              else pick(moves[0])
            }}
          />
        )
      })}
      {chooser && (
        <div
          role="group"
          aria-label={`Choose a piece for ${placeName(chooser.moves[0].to)}`}
          className="chooser"
          style={chooserPlacement(chooser.point)}
          onClick={(e) => e.stopPropagation()}
        >
          {chooser.moves.map((move, i) => {
            const rolls = combinedRolls(state, move)
            return (
              <button
                key={i}
                type="button"
                className={move.kick ? 'choice kick' : 'choice'}
                aria-label={labelFor(move)}
                autoFocus={i === 0}
                {...previewProps(move)}
                onClick={() => pick(move)}
              >
                <strong>Piece {numberOf(move.piece)}</strong>
                <span>
                  {targetAction(move)}
                  {rolls && ` · ${rolls}`}
                </span>
              </button>
            )
          })}
        </div>
      )}
      {names &&
        state.players.map(({ color, pieces: at, finishedPlace }) => {
          const o = yardAt(color)
          const home = at.filter((p) => p.kind === 'home').length
          return (
            <div
              key={color}
              data-testid={`yard-label-${color}`}
              className={color === active ? 'yard-label active' : 'yard-label'}
              style={{ left: pct(o.x + 4), top: pct(o.y + 4), color: ON_COLOR[color] }}
            >
              <span className="yard-name">{names[color]}</span>
              {/* Whose turn it is shows above the dice; the active yard is only outlined. */}
              {finishedPlace ? (
                <span className="yard-place">{ORDINAL[finishedPlace - 1]}</span>
              ) : (
                <span className="yard-home">{home} home</span>
              )}
            </div>
          )
        })}
      {(Object.entries(state.labourers) as [Color, Color][]).map(([victim, owner]) => {
        const o = yardAt(victim)
        return (
          <div
            key={victim}
            data-testid={`labourer-${victim}`}
            className="yard-labourer"
            style={{ left: pct(o.x + 4), top: pct(o.y + 200), color: ON_COLOR[victim] }}
          >
            {/* Three chain links: two lying flat, the middle one standing up through them. */}
            <svg viewBox="0 0 16 12" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
              <rect x="0.8" y="3.5" width="6" height="5" rx="2.5" />
              <rect x="6" y="2" width="4" height="8" rx="2" />
              <rect x="9.2" y="3.5" width="6" height="5" rx="2.5" />
            </svg>
            Labourer to {COLOR_NAME[owner]}
          </div>
        )
      })}
      {children}
    </div>
  )
}
