import { lane } from './position'
import { COLORS, type Color, type Position } from './types'

export type Cell = readonly [column: number, row: number]

export const TRACK_LENGTH = 52
export const LANE_LENGTH = 5

function run(from: Cell, to: Cell): Cell[] {
  const dc = Math.sign(to[0] - from[0])
  const dr = Math.sign(to[1] - from[1])
  const cells: Cell[] = []
  let [c, r] = from
  for (;;) {
    cells.push([c, r])
    if (c === to[0] && r === to[1]) return cells
    c += dc
    r += dr
  }
}

/** The 52 shared track squares clockwise, starting at red's start square. */
export const TRACK: Cell[] = [
  ...run([1, 6], [5, 6]),
  ...run([6, 5], [6, 0]),
  [7, 0],
  ...run([8, 0], [8, 5]),
  ...run([9, 6], [14, 6]),
  [14, 7],
  ...run([14, 8], [9, 8]),
  ...run([8, 9], [8, 14]),
  [7, 14],
  ...run([6, 14], [6, 9]),
  ...run([5, 8], [0, 8]),
  [0, 7],
  [0, 6],
]

export const colorIndex = (color: Color): number => COLORS.indexOf(color)
export const startIndex = (color: Color): number => colorIndex(color) * 13
/** The arm tip a colour turns into its home lane from. */
export const entryIndex = (color: Color): number => (startIndex(color) + 50) % TRACK_LENGTH

/** Grid cell of a colour's home lane square `i` (1–5), counted from the arm tip inwards. */
export function laneCell(owner: Color, i: number): Cell {
  switch (owner) {
    case 'red':
      return [i, 7]
    case 'green':
      return [7, i]
    case 'yellow':
      return [14 - i, 7]
    case 'blue':
      return [7, 14 - i]
  }
}

const trackIndexByCell = new Map(TRACK.map(([c, r], i) => [`${c},${r}`, i]))

export type Across = { across: number; between: Position }

/** Track squares facing each other across a lane square (rows 1–5 of each arm). */
export const LINE_ACROSS: ReadonlyMap<number, Across> = (() => {
  const pairs = new Map<number, Across>()
  for (const owner of COLORS) {
    for (let i = 1; i <= LANE_LENGTH; i++) {
      const [c, r] = laneCell(owner, i)
      const horizontal = r === 7
      const a = trackIndexByCell.get(horizontal ? `${c},6` : `6,${r}`)!
      const b = trackIndexByCell.get(horizontal ? `${c},8` : `8,${r}`)!
      pairs.set(a, { across: b, between: lane(owner, i) })
      pairs.set(b, { across: a, between: lane(owner, i) })
    }
  }
  return pairs
})()
