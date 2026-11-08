import { COLORS, TRACK, laneCell, posKey, startIndex, type Color, type GameState, type PieceId, type Position } from '@ludo/engine'

export const CELL = 40
export const BOARD_SIZE = 600

export type Point = { x: number; y: number }

const YARD: Record<Color, Point> = {
  red: { x: 0, y: 0 },
  green: { x: 360, y: 0 },
  yellow: { x: 360, y: 360 },
  blue: { x: 0, y: 360 },
}
const BASE_SPOTS: Point[] = [
  { x: 80, y: 80 },
  { x: 160, y: 80 },
  { x: 80, y: 160 },
  { x: 160, y: 160 },
]
const HOME_SPOT: Record<Color, Point> = {
  red: { x: 270, y: 300 },
  green: { x: 300, y: 270 },
  yellow: { x: 330, y: 300 },
  blue: { x: 300, y: 330 },
}

export const yardOrigin = (color: Color): Point => YARD[color]

const cellCenter = ([c, r]: readonly [number, number]): Point => ({ x: c * CELL + CELL / 2, y: r * CELL + CELL / 2 })

export function positionPoint(pos: Position, piece: PieceId): Point {
  switch (pos.kind) {
    case 'base': {
      const yard = YARD[piece.color]
      const spot = BASE_SPOTS[piece.index]
      return { x: yard.x + spot.x, y: yard.y + spot.y }
    }
    case 'track':
      return cellCenter(TRACK[pos.index])
    case 'lane':
      return cellCenter(laneCell(pos.owner, pos.index))
    case 'home':
      return HOME_SPOT[piece.color]
  }
}

export type Tile = { x: number; y: number; fill: Color | null }

/** The 52 track squares (in track order, start squares coloured) then the 20 lane squares. */
export const TILES: Tile[] = [
  ...TRACK.map(([c, r], index) => ({ x: c * CELL, y: r * CELL, fill: COLORS.find((color) => startIndex(color) === index) ?? null })),
  ...COLORS.flatMap((color) =>
    [1, 2, 3, 4, 5].map((i) => {
      const [c, r] = laneCell(color, i)
      return { x: c * CELL, y: r * CELL, fill: color }
    }),
  ),
]

export type Placement = { piece: PieceId; point: Point; stack: number; top: boolean }
export type Moving = { piece: PieceId; at: Position }

/** Where to draw every piece. `moving` overrides one piece's position (animation). Stacks fan out. */
export function placements(state: GameState, moving?: Moving): Placement[] {
  const all = state.players.flatMap((player) =>
    player.pieces.map((pos, index) => {
      const piece = { color: player.color, index }
      const isMoving = moving && moving.piece.color === player.color && moving.piece.index === index
      return { piece, at: isMoving ? moving.at : pos }
    }),
  )
  const groups = new Map<string, typeof all>()
  for (const entry of all) {
    const { at, piece } = entry
    const key = at.kind === 'base' ? `base-${piece.color}-${piece.index}` : at.kind === 'home' ? `home-${piece.color}` : posKey(at)
    groups.set(key, [...(groups.get(key) ?? []), entry])
  }
  // Draw the lowest-index piece last (on top): it is the one the engine lets move out of a stack.
  return [...groups.values()].flatMap((group) =>
    [...group].reverse().map(({ piece, at }, i) => {
      const base = positionPoint(at, piece)
      const offset = (i - (group.length - 1) / 2) * 6
      return { piece, point: { x: base.x + offset, y: base.y + offset }, stack: group.length, top: i === group.length - 1 }
    }),
  )
}
