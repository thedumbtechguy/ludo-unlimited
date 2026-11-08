import { COLORS, positionOf, type Color, type GameState, type Move, type PieceId } from '@ludo/engine'
import { BOARD_SIZE, CELL, TILES, placements, positionPoint, yardOrigin, type Moving } from '../layout'
import { COLOR_NAME, pieceLabel, targetLabel } from '../labels'
import { BOARD_BG, COLOR_HEX, KICK_MARK, MOVE_MARK, TILE } from '../theme'

export type BoardProps = {
  state: GameState
  moving?: Moving
  movable?: PieceId[]
  selected?: PieceId
  targets?: Move[]
  onSelectPiece?: (piece: PieceId) => void
  onPickTarget?: (move: Move) => void
}

const samePiece = (a: PieceId, b?: PieceId) => b !== undefined && a.color === b.color && a.index === b.index
const pct = (v: number) => `${(v / BOARD_SIZE) * 100}%`

const CENTER: [Color, string][] = [
  ['green', '240,240 360,240 300,300'],
  ['yellow', '360,240 360,360 300,300'],
  ['blue', '240,360 360,360 300,300'],
  ['red', '240,240 240,360 300,300'],
]

export function Board({ state, moving, movable = [], selected, targets = [], onSelectPiece, onPickTarget }: BoardProps) {
  const pieces = placements(state, moving)
  const pointOf = (piece: PieceId) => pieces.find((p) => samePiece(p.piece, piece))!.point

  return (
    <div className="board">
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
        {targets.map((move, i) => {
          const p = positionPoint(move.to, move.piece)
          return (
            <circle
              key={i}
              data-testid="target-marker"
              cx={p.x}
              cy={p.y}
              r="16"
              fill="none"
              stroke={move.kick ? KICK_MARK : MOVE_MARK}
              strokeWidth="4"
              strokeDasharray="6 4"
            />
          )
        })}
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
      </svg>

      {movable.map((piece) => {
        const p = pointOf(piece)
        return (
          <button
            key={`piece-${piece.color}-${piece.index}`}
            type="button"
            className="hit"
            style={{ left: pct(p.x), top: pct(p.y) }}
            aria-label={pieceLabel(piece, positionOf(state, piece))}
            aria-pressed={samePiece(piece, selected)}
            onClick={() => onSelectPiece?.(piece)}
          />
        )
      })}
      {targets.map((move, i) => {
        const p = positionPoint(move.to, move.piece)
        return (
          <button
            key={`target-${i}`}
            type="button"
            className="hit"
            style={{ left: pct(p.x), top: pct(p.y) }}
            aria-label={targetLabel(move)}
            onClick={() => onPickTarget?.(move)}
          />
        )
      })}
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
