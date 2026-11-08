import { COLORS, posKey, positionOf, type Color, type GameState, type Move, type PieceId } from '@ludo/engine'
import { useEffect, useState } from 'react'
import { BOARD_SIZE, CELL, TILES, placements, positionPoint, yardOrigin, type Moving, type Point } from '../layout'
import {
  COLOR_NAME,
  combinedRolls,
  listNumbers,
  numberedPieceLabel,
  numberedTargetLabel,
  pieceLabel,
  placeName,
  targetAction,
  targetLabel,
} from '../labels'
import { BOARD_BG, COLOR_HEX, KICK_MARK, MOVE_MARK, TILE } from '../theme'

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
}

/** Every target move landing on one square. */
type Destination = { key: string; point: Point; moves: Move[] }

function destinations(targets: Move[]): Destination[] {
  const byKey = new Map<string, Destination>()
  for (const move of targets) {
    const key = posKey(move.to)
    const existing = byKey.get(key)
    if (existing) existing.moves.push(move)
    else byKey.set(key, { key, point: positionPoint(move.to, move.piece), moves: [move] })
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

const CENTER: [Color, string][] = [
  ['green', '240,240 360,240 300,300'],
  ['yellow', '360,240 360,360 300,300'],
  ['blue', '240,360 360,360 300,300'],
  ['red', '240,240 240,360 300,300'],
]

export function Board({ state, moving, movable = [], selected, targets = [], onSelectPiece, onPickTarget, onDeselect, onPreview }: BoardProps) {
  const pieces = placements(state, moving)
  const pointOf = (piece: PieceId) => pieces.find((p) => samePiece(p.piece, piece))!.point
  // With 2+ movable pieces and none selected, number them so each destination can say whose it is.
  const numbered = !selected && movable.length > 1
  const numberOf = (piece: PieceId) => movable.findIndex((m) => samePiece(m, piece)) + 1
  const spots = destinations(targets)

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
      <svg viewBox={`0 0 ${BOARD_SIZE} ${BOARD_SIZE}`} aria-hidden="true">
        <defs>
          <filter id="piece-shadow" x="-50%" y="-50%" width="200%" height="200%">
            <feDropShadow dx="0" dy="3" stdDeviation="3" floodColor="#0f172a" floodOpacity="0.35" />
          </filter>
        </defs>
        <rect width={BOARD_SIZE} height={BOARD_SIZE} rx="16" fill={BOARD_BG} />
        {COLORS.map((color) => {
          const o = yardOrigin(color)
          return (
            <g key={color}>
              <rect x={o.x + 4} y={o.y + 4} width="232" height="232" rx="24" fill={COLOR_HEX[color]} />
              <rect x={o.x + 40} y={o.y + 40} width="160" height="160" rx="20" fill={TILE} />
            </g>
          )
        })}
        {TILES.map((tile, i) => (
          <rect
            key={i}
            data-testid="tile"
            x={tile.x + 1}
            y={tile.y + 1}
            width={CELL - 2}
            height={CELL - 2}
            rx="8"
            fill={tile.fill ? COLOR_HEX[tile.fill] : TILE}
          />
        ))}
        {CENTER.map(([color, points]) => (
          <polygon key={color} points={points} fill={COLOR_HEX[color]} />
        ))}
        {pieces.map(({ piece, point, stack, top }) => {
          const isMovable = movable.some((m) => samePiece(m, piece))
          return (
            <g
              key={`${piece.color}-${piece.index}`}
              data-testid="piece"
              data-piece={`${piece.color}-${piece.index}`}
              className={isMovable ? 'piece movable' : 'piece'}
              style={{ transform: `translate(${point.x}px, ${point.y}px)` }}
            >
              <circle className="body" r="15" fill={COLOR_HEX[piece.color]} stroke="#ffffff" strokeWidth="4" filter="url(#piece-shadow)" />
              {samePiece(piece, selected) && <circle r="21" fill="none" stroke="#0f172a" strokeWidth="3" />}
              {stack > 1 && top && (
                <g transform="translate(13 -13)">
                  <circle r="9" fill="#0f172a" />
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
                <g transform={`translate(${point.x} ${point.y + 24})`}>
                  <rect x={-4 - rolls.length * 3.5} y="-8" width={8 + rolls.length * 7} height="16" rx="8" fill="#0f172a" />
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
                <circle r="10" fill="#ffffff" stroke="#0f172a" strokeWidth="2" />
                <text data-testid="piece-number" textAnchor="middle" dy="4.5" fontSize="13" fontWeight="800" fill="#0f172a">
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
      {/* After the pieces, so a destination wins where it overlaps a piece. */}
      {spots.map(({ key, point, moves }) => {
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
      {(Object.entries(state.labourers) as [Color, Color][]).map(([victim, owner]) => {
        const o = yardOrigin(victim)
        return (
          <div key={victim} className="labourer-badge" style={{ left: pct(o.x + 120), top: pct(o.y + 12) }}>
            Labourer to {COLOR_NAME[owner]}
          </div>
        )
      })}
    </div>
  )
}
