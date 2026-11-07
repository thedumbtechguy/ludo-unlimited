# Ludo Rules Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers-extended-cc:subagent-driven-development (recommended) or superpowers-extended-cc:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a pure TypeScript Ludo rules engine with toggleable Ghanaian rules (Back Kick, Line Kick, Home Kick, Labourer), as specified in `docs/superpowers/specs/2026-11-07-rules-engine-design.md`.

**Architecture:** The engine is an npm workspace package, `packages/engine`. Every function is pure (`state in → new state out`) and takes plain-JSON state. Each rule is its own move generator. `legalMoves` combines the generators and removes duplicates. `roll`, `applyMove` and `pass` drive turns and append to an event log that `replay` can rebuild from.

**Tech Stack:** TypeScript (strict), Vitest, Node 20+, npm workspaces.

**User Verification:** NO. The user approved the spec, and these tasks are verified by automated tests.

**Repo rules:** The project isn't a git repo, and the user's standing instruction is **never stage or commit unless explicitly asked**. Tasks therefore have no commit steps.

**Shared conventions (read once):**
- Board coordinates are `[column, row]` on a 15×15 grid, starting from the top left.
- The 52 track squares are numbered clockwise from red's start square at `[1,6]`.
- Seat order is clockwise: `red` (top left yard), `green` (top right), `yellow` (bottom right), `blue` (bottom left). A colour's start index is `seat × 13`, and its lane entry (the tip of its arm) is `(start + 50) % 52`.
- Useful indices:
  - Red: start 0, entry 50.
  - Green: start 13, entry 11.
  - Yellow: start 26, entry 24.
  - Blue: start 39, entry 37.
  - Across green's lane, track `10 - i` faces track `12 + i`, for lane square `i` from 1 to 5. For example, 7 ↔ 15 across `lane(green, 3)`.
  - Across red's lane, 0 ↔ 48 (lane 1) and 1 ↔ 47 (lane 2).
- The tests use `setup()` from `test/helpers.ts`:
  - It defaults to 4 players and all toggles off.
  - In `pieces`, a number means a track index, and any piece not listed is in base.
  - `roll` sets `pendingRoll` directly, skipping `roll()`. Tests of the full turn flow call the real `roll()`.
- Run every command from `packages/engine` unless the step says otherwise.

---

### Task 0: Scaffold the workspace

**Goal:** Create an npm workspace with an `@ludo/engine` package where Vitest and `tsc` both run.

**Files:**
- Create: `package.json`, `.gitignore`, `packages/engine/package.json`, `packages/engine/tsconfig.json`, `packages/engine/src/index.ts`

**Acceptance Criteria:**
- [ ] `npm test` at the root runs Vitest in the engine package and exits 0.
- [ ] `npm run typecheck` at the root exits 0.

**Verify:** `npm test && npm run typecheck` (from the repo root) → exits 0 and prints "No test files found" (with `--passWithNoTests`).

**Steps:**

- [ ] **Step 1: Root files**

`package.json`:
```json
{
  "name": "ludo",
  "private": true,
  "workspaces": ["packages/*"],
  "scripts": {
    "test": "npm test --workspaces",
    "typecheck": "npm run typecheck --workspaces"
  }
}
```

`.gitignore`:
```
node_modules/
```

- [ ] **Step 2: Engine package**

`packages/engine/package.json`:
```json
{
  "name": "@ludo/engine",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "src/index.ts",
  "scripts": {
    "test": "vitest run --passWithNoTests",
    "typecheck": "tsc --noEmit"
  }
}
```

`packages/engine/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022"],
    "types": ["node"],
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true
  },
  "include": ["src", "test"]
}
```

`packages/engine/src/index.ts`:
```ts
export {}
```

- [ ] **Step 3: Install dev dependencies** (from the repo root)

Run: `npm install -D -w @ludo/engine typescript vitest @types/node`
Expected: `packages/engine/package.json` gains `devDependencies`, and `node_modules/` is created.

- [ ] **Step 4: Verify**

Run (from the repo root): `npm test && npm run typecheck`
Expected: exits 0.

---

### Task 1: Types, positions and board geometry

**Goal:** Define the shared types, the position helpers, and the board's track, lanes and Line Kick table.

**Files:**
- Create: `packages/engine/src/types.ts`, `packages/engine/src/position.ts`, `packages/engine/src/board.ts`
- Test: `packages/engine/test/board.test.ts`

**Acceptance Criteria:**
- [ ] The track has 52 unique, connected squares.
- [ ] Start squares and lane entries match the conventions above.
- [ ] `LINE_ACROSS` has 40 symmetric entries and none in row 0.

**Verify:** `npx vitest run test/board.test.ts` → all pass.

**Steps:**

- [ ] **Step 1: Write `src/types.ts`**

```ts
export const COLORS = ['red', 'green', 'yellow', 'blue'] as const
export type Color = (typeof COLORS)[number]

export type Position =
  | { kind: 'base' }
  | { kind: 'track'; index: number }
  | { kind: 'lane'; owner: Color; index: number }
  | { kind: 'home' }

export type PieceId = { color: Color; index: number }

export type Rules = {
  backKick: boolean
  lineKick: boolean
  homeKick: boolean
  labourer: boolean
}

export type EndCondition = 'firstWins' | 'playForPlaces'

export type Settings = {
  players: 2 | 3 | 4
  rules: Rules
  endCondition: EndCondition
}

export type Move =
  | { kind: 'enter'; piece: PieceId; to: Position; kick?: PieceId }
  | { kind: 'forward'; piece: PieceId; to: Position; kick?: PieceId }
  | { kind: 'back'; piece: PieceId; to: Position; kick: PieceId }
  | { kind: 'line'; piece: PieceId; via: Position; to: Position; kick: PieceId }
  | { kind: 'homeKick'; piece: PieceId; to: Position; kick: PieceId }

export type GameEvent =
  | { type: 'roll'; value: number }
  | { type: 'move'; move: Move }
  | { type: 'pass' }

export type PlayerState = {
  color: Color
  pieces: Position[]
  finishedPlace?: number
}

export type GameState = {
  settings: Settings
  players: PlayerState[]
  turn: Color
  pendingRoll?: number
  labourers: Partial<Record<Color, Color>> // victim → owner
  log: GameEvent[]
  status: 'playing' | 'finished'
}
```

- [ ] **Step 2: Write `src/position.ts`**

```ts
import type { Color, Position } from './types'

export const BASE: Position = { kind: 'base' }
export const HOME: Position = { kind: 'home' }
export const track = (index: number): Position => ({ kind: 'track', index })
export const lane = (owner: Color, index: number): Position => ({ kind: 'lane', owner, index })

export function posKey(pos: Position): string {
  switch (pos.kind) {
    case 'track':
      return `t${pos.index}`
    case 'lane':
      return `l-${pos.owner}-${pos.index}`
    default:
      return pos.kind
  }
}

export const samePos = (a: Position, b: Position): boolean => posKey(a) === posKey(b)

export const isOnBoard = (pos: Position): boolean => pos.kind === 'track' || pos.kind === 'lane'
```

- [ ] **Step 3: Write the failing test `test/board.test.ts`**

```ts
import { describe, expect, it } from 'vitest'
import { LINE_ACROSS, TRACK, entryIndex, laneCell, startIndex } from '../src/board'
import { lane } from '../src/position'
import { COLORS } from '../src/types'

const touches = (a: readonly number[], b: readonly number[]) =>
  Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1])) === 1

describe('board geometry', () => {
  it('has 52 unique track squares', () => {
    expect(TRACK).toHaveLength(52)
    expect(new Set(TRACK.map((c) => c.join(','))).size).toBe(52)
  })

  it('is a closed loop of touching squares', () => {
    TRACK.forEach((cell, i) => expect(touches(cell, TRACK[(i + 1) % 52])).toBe(true))
  })

  it('puts start squares where the conventions say', () => {
    expect(TRACK[startIndex('red')]).toEqual([1, 6])
    expect(TRACK[startIndex('green')]).toEqual([8, 1])
    expect(TRACK[startIndex('yellow')]).toEqual([13, 8])
    expect(TRACK[startIndex('blue')]).toEqual([6, 13])
  })

  it('puts lane entries on the arm tips', () => {
    expect(TRACK[entryIndex('red')]).toEqual([0, 7])
    expect(TRACK[entryIndex('green')]).toEqual([7, 0])
    expect(TRACK[entryIndex('yellow')]).toEqual([14, 7])
    expect(TRACK[entryIndex('blue')]).toEqual([7, 14])
  })

  it('starts each lane next to its entry', () => {
    for (const color of COLORS) expect(touches(laneCell(color, 1), TRACK[entryIndex(color)])).toBe(true)
  })

  it('pairs 40 squares across lanes, symmetrically', () => {
    expect(LINE_ACROSS.size).toBe(40)
    for (const [index, pair] of LINE_ACROSS) expect(LINE_ACROSS.get(pair.across)?.across).toBe(index)
  })

  it('pairs track 7 and 15 across green lane 3', () => {
    expect(LINE_ACROSS.get(7)).toEqual({ across: 15, between: lane('green', 3) })
  })

  it('pairs red start with track 48 across red lane 1', () => {
    expect(LINE_ACROSS.get(0)).toEqual({ across: 48, between: lane('red', 1) })
  })

  it('never pairs row 0 (the arm tips)', () => {
    for (const index of [10, 12, 49, 51]) expect(LINE_ACROSS.has(index)).toBe(false)
  })
})
```

- [ ] **Step 4: Run the test to see it fail**

Run: `npx vitest run test/board.test.ts`
Expected: FAIL, because `../src/board` doesn't exist.

- [ ] **Step 5: Write `src/board.ts`**

```ts
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
```

- [ ] **Step 6: Run the test to see it pass**

Run: `npx vitest run test/board.test.ts && npx tsc --noEmit`
Expected: all pass, with no type errors.

---

### Task 2: State, occupancy, paths and the test helper

**Goal:** Add `createGame`, piece lookups, block and lone-opponent detection, forward and backward paths, and the `setup()` test helper.

**Files:**
- Create: `packages/engine/src/state.ts`, `packages/engine/src/occupancy.ts`, `packages/engine/src/path.ts`, `packages/engine/test/helpers.ts`
- Test: `packages/engine/test/path.test.ts`

**Acceptance Criteria:**
- [ ] Forward paths turn into the mover's own lane at its entry, need an exact roll for home, and lead out of an opponent's lane back toward the track.
- [ ] Backward paths wrap past index 0 and only start from the track.
- [ ] `isClear` is false whenever an opponent block is on the path.

**Verify:** `npx vitest run test/path.test.ts` → all pass.

**Steps:**

- [ ] **Step 1: Write `src/state.ts`**

```ts
import { BASE } from './position'
import { COLORS, type Color, type GameState, type PieceId, type PlayerState, type Position, type Settings } from './types'

export const SEATS: Record<Settings['players'], Color[]> = {
  2: ['red', 'yellow'],
  3: ['red', 'green', 'yellow'],
  4: [...COLORS],
}

export function createGame(settings: Settings): GameState {
  return {
    settings,
    players: SEATS[settings.players].map((color) => ({ color, pieces: [BASE, BASE, BASE, BASE] })),
    turn: SEATS[settings.players][0],
    labourers: {},
    log: [],
    status: 'playing',
  }
}

export function getPlayer(state: GameState, color: Color): PlayerState {
  const player = state.players.find((p) => p.color === color)
  if (!player) throw new Error(`${color} is not playing`)
  return player
}

export const positionOf = (state: GameState, piece: PieceId): Position =>
  getPlayer(state, piece.color).pieces[piece.index]

/** Deep copy, except the append-only log, whose events are never mutated. */
export function cloneState(state: GameState): GameState {
  return { ...structuredClone({ ...state, log: [] }), log: state.log.slice() }
}
```

- [ ] **Step 2: Write `src/occupancy.ts`**

```ts
import { posKey } from './position'
import type { Color, GameState, PieceId, Position } from './types'

export function piecesAt(state: GameState, pos: Position): PieceId[] {
  if (pos.kind === 'base' || pos.kind === 'home') return []
  const key = posKey(pos)
  return state.players.flatMap((player) =>
    player.pieces.flatMap((p, index) => (posKey(p) === key ? [{ color: player.color, index }] : [])),
  )
}

/** Two or more pieces of one opponent colour. Squares never hold two colours. */
export function isOpponentBlock(state: GameState, pos: Position, mover: Color): boolean {
  const here = piecesAt(state, pos)
  return here.length >= 2 && here[0].color !== mover
}

export function loneOpponent(state: GameState, pos: Position, mover: Color): PieceId | undefined {
  const here = piecesAt(state, pos)
  return here.length === 1 && here[0].color !== mover ? here[0] : undefined
}

export const hasOpponent = (state: GameState, pos: Position, mover: Color): boolean =>
  piecesAt(state, pos).some((p) => p.color !== mover)
```

- [ ] **Step 3: Write `test/helpers.ts`**

```ts
import { track } from '../src/position'
import { createGame } from '../src/state'
import type { Color, GameState, PieceId, Position, Rules, Settings } from '../src/types'

type Spot = number | Position

export type SetupOptions = {
  players?: Settings['players']
  rules?: Partial<Rules>
  endCondition?: Settings['endCondition']
  turn?: Color
  /** Sets pendingRoll directly, skipping roll(). */
  roll?: number
  /** A number is a track index; unlisted pieces stay in base. */
  pieces?: Partial<Record<Color, Spot[]>>
  labourers?: GameState['labourers']
}

export function setup(opts: SetupOptions = {}): GameState {
  const state = createGame({
    players: opts.players ?? 4,
    rules: { backKick: false, lineKick: false, homeKick: false, labourer: false, ...opts.rules },
    endCondition: opts.endCondition ?? 'firstWins',
  })
  for (const [color, spots] of Object.entries(opts.pieces ?? {}) as [Color, Spot[]][]) {
    const player = state.players.find((p) => p.color === color)
    if (!player) throw new Error(`${color} is not seated`)
    spots.forEach((spot, i) => {
      player.pieces[i] = typeof spot === 'number' ? track(spot) : spot
    })
  }
  if (opts.turn) state.turn = opts.turn
  if (opts.roll !== undefined) state.pendingRoll = opts.roll
  if (opts.labourers) state.labourers = { ...opts.labourers }
  return state
}

export const piece = (color: Color, index = 0): PieceId => ({ color, index })
```

- [ ] **Step 4: Write the failing test `test/path.test.ts`**

```ts
import { describe, expect, it } from 'vitest'
import { backwardPath, forwardPath, isClear } from '../src/path'
import { BASE, HOME, lane, track } from '../src/position'
import { setup } from './helpers'

describe('forwardPath', () => {
  it('turns into its own lane at its entry', () => {
    expect(forwardPath('red', track(48), 4)).toEqual([track(49), track(50), lane('red', 1), lane('red', 2)])
  })

  it('walks past other colours’ entries', () => {
    expect(forwardPath('red', track(10), 3)).toEqual([track(11), track(12), track(13)])
    expect(forwardPath('green', track(10), 3)).toEqual([track(11), lane('green', 1), lane('green', 2)])
  })

  it('wraps from 51 to 0', () => {
    expect(forwardPath('green', track(51), 2)).toEqual([track(0), track(1)])
  })

  it('needs an exact roll for home', () => {
    expect(forwardPath('red', lane('red', 4), 2)).toEqual([lane('red', 5), HOME])
    expect(forwardPath('red', lane('red', 4), 3)).toBeNull()
  })

  it('leads out of an opponent’s lane back to the track', () => {
    expect(forwardPath('red', lane('yellow', 2), 4)).toEqual([lane('yellow', 1), track(24), track(25), track(26)])
  })

  it('cannot move from base or home', () => {
    expect(forwardPath('red', BASE, 1)).toBeNull()
    expect(forwardPath('red', HOME, 1)).toBeNull()
  })
})

describe('backwardPath', () => {
  it('wraps backwards past index 0', () => {
    expect(backwardPath(track(1), 3)).toEqual([track(0), track(51), track(50)])
  })

  it('only starts from the track', () => {
    expect(backwardPath(lane('red', 2), 1)).toBeNull()
    expect(backwardPath(BASE, 1)).toBeNull()
  })
})

describe('isClear', () => {
  it('is blocked by an opponent block, but not by your own', () => {
    const s = setup({ pieces: { yellow: [7, 7] } })
    const path = [track(6), track(7), track(8)]
    expect(isClear(s, path, 'red')).toBe(false)
    expect(isClear(s, path, 'yellow')).toBe(true)
  })

  it('is not blocked by a lone opponent', () => {
    const s = setup({ pieces: { yellow: [7] } })
    expect(isClear(s, [track(6), track(7), track(8)], 'red')).toBe(true)
  })
})
```

- [ ] **Step 5: Run the test to see it fail**

Run: `npx vitest run test/path.test.ts`
Expected: FAIL, because `../src/path` doesn't exist.

- [ ] **Step 6: Write `src/path.ts`**

```ts
import { LANE_LENGTH, TRACK_LENGTH, entryIndex } from './board'
import { isOpponentBlock } from './occupancy'
import { HOME, lane, track } from './position'
import type { Color, GameState, Position } from './types'

/** One step along `color`'s route. Route depends only on position (no lap counting). */
export function stepForward(color: Color, pos: Position): Position | null {
  switch (pos.kind) {
    case 'track':
      return pos.index === entryIndex(color) ? lane(color, 1) : track((pos.index + 1) % TRACK_LENGTH)
    case 'lane':
      if (pos.owner === color) return pos.index < LANE_LENGTH ? lane(color, pos.index + 1) : HOME
      return pos.index > 1 ? lane(pos.owner, pos.index - 1) : track(entryIndex(pos.owner))
    default:
      return null
  }
}

/** Squares visited after each step, or null if the route runs out (e.g. overshooting home). */
export function forwardPath(color: Color, from: Position, steps: number): Position[] | null {
  const path: Position[] = []
  let pos = from
  for (let i = 0; i < steps; i++) {
    const next = stepForward(color, pos)
    if (!next) return null
    path.push(next)
    pos = next
  }
  return path
}

/** Backwards along the track only. */
export function backwardPath(from: Position, steps: number): Position[] | null {
  if (from.kind !== 'track') return null
  return Array.from({ length: steps }, (_, i) => track((from.index - i - 1 + TRACK_LENGTH) % TRACK_LENGTH))
}

export const isClear = (state: GameState, path: Position[], mover: Color): boolean =>
  path.every((pos) => !isOpponentBlock(state, pos, mover))
```

- [ ] **Step 7: Run the test to see it pass**

Run: `npx vitest run && npx tsc --noEmit`
Expected: all pass, with no type errors.

---

### Task 3: Legal moves: enter, forward (Front Kick), blocks, dedupe

**Goal:** Write `legalMoves` with the `enter` and `forward` generators and remove duplicate moves by outcome.

**Files:**
- Create: `packages/engine/src/moves/enter.ts`, `packages/engine/src/moves/forward.ts`, `packages/engine/src/legalMoves.ts`
- Test: `packages/engine/test/frontKick.test.ts`, `packages/engine/test/blocks.test.ts`

**Acceptance Criteria:**
- [ ] Landing on a lone opponent always produces a kick, and a different non-kicking move can still be chosen.
- [ ] Only a 6 enters. Entering kicks a lone opponent on the start square and is blocked by an opponent block.
- [ ] A move can't pass or land on an opponent block, but it can pass or join its own.

**Verify:** `npx vitest run test/frontKick.test.ts test/blocks.test.ts` → all pass.

**Steps:**

- [ ] **Step 1: Write the failing tests**

`test/frontKick.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { legalMoves } from '../src/legalMoves'
import { track } from '../src/position'
import { piece, setup } from './helpers'

describe('front kick (always on)', () => {
  it('a forward move landing on a lone opponent kicks it', () => {
    const s = setup({ roll: 3, pieces: { red: [5], yellow: [8] } })
    expect(legalMoves(s)).toEqual([{ kind: 'forward', piece: piece('red'), to: track(8), kick: piece('yellow') }])
  })

  it('the player may still choose a different, non-kicking move', () => {
    const s = setup({ roll: 3, pieces: { red: [5, 20], yellow: [8] } })
    expect(legalMoves(s)).toContainEqual({ kind: 'forward', piece: piece('red', 1), to: track(23) })
  })

  it('entering kicks a lone opponent on the start square', () => {
    const s = setup({ roll: 6, pieces: { yellow: [0] } })
    expect(legalMoves(s)).toContainEqual({ kind: 'enter', piece: piece('red'), to: track(0), kick: piece('yellow') })
  })

  it('only a 6 enters', () => {
    expect(legalMoves(setup({ roll: 5 }))).toEqual([])
  })

  it('landing on your own piece is allowed', () => {
    const s = setup({ roll: 2, pieces: { red: [5, 7] } })
    expect(legalMoves(s)).toContainEqual({ kind: 'forward', piece: piece('red'), to: track(7) })
  })

  it('nothing is legal without a pending roll', () => {
    expect(legalMoves(setup({ pieces: { red: [5] } }))).toEqual([])
  })
})
```

`test/blocks.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { legalMoves } from '../src/legalMoves'
import { track } from '../src/position'
import { piece, setup } from './helpers'

describe('blocks', () => {
  it('cannot pass an opponent block', () => {
    expect(legalMoves(setup({ roll: 4, pieces: { red: [5], yellow: [7, 7] } }))).toEqual([])
  })

  it('cannot land on an opponent block', () => {
    expect(legalMoves(setup({ roll: 2, pieces: { red: [5], yellow: [7, 7] } }))).toEqual([])
  })

  it('cannot enter onto an opponent block', () => {
    expect(legalMoves(setup({ roll: 6, pieces: { yellow: [0, 0] } }))).toEqual([])
  })

  it('can pass your own block', () => {
    const s = setup({ roll: 4, pieces: { red: [5, 7, 7] } })
    expect(legalMoves(s)).toContainEqual({ kind: 'forward', piece: piece('red'), to: track(9) })
  })
})
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run test/frontKick.test.ts test/blocks.test.ts`
Expected: FAIL, because `../src/legalMoves` doesn't exist.

- [ ] **Step 3: Write `src/moves/enter.ts`**

```ts
import { startIndex } from '../board'
import { isOpponentBlock, loneOpponent } from '../occupancy'
import { track } from '../position'
import { positionOf } from '../state'
import type { GameState, Move, PieceId } from '../types'

export function enterMoves(state: GameState, piece: PieceId, roll: number): Move[] {
  if (roll !== 6 || positionOf(state, piece).kind !== 'base') return []
  const to = track(startIndex(piece.color))
  if (isOpponentBlock(state, to, piece.color)) return []
  return [{ kind: 'enter', piece, to, kick: loneOpponent(state, to, piece.color) }]
}
```

- [ ] **Step 4: Write `src/moves/forward.ts`**

```ts
import { loneOpponent } from '../occupancy'
import { forwardPath, isClear } from '../path'
import { positionOf } from '../state'
import type { GameState, Move, PieceId } from '../types'

/** Normal move. Landing on a lone opponent kicks it (Front Kick, always on). */
export function forwardMoves(state: GameState, piece: PieceId, roll: number): Move[] {
  const path = forwardPath(piece.color, positionOf(state, piece), roll)
  if (!path || !isClear(state, path, piece.color)) return []
  const to = path[path.length - 1]
  return [{ kind: 'forward', piece, to, kick: loneOpponent(state, to, piece.color) }]
}
```

- [ ] **Step 5: Write `src/legalMoves.ts`**

```ts
import { enterMoves } from './moves/enter'
import { forwardMoves } from './moves/forward'
import { posKey } from './position'
import { getPlayer } from './state'
import type { GameState, Move, PieceId } from './types'

type MoveGenerator = (state: GameState, piece: PieceId, roll: number) => Move[]

const GENERATORS: MoveGenerator[] = [enterMoves, forwardMoves]

/** Moves with the same key have the same result; the player sees only one. */
export function outcomeKey(move: Move): string {
  const kick = move.kick ? `${move.kick.color}${move.kick.index}` : '-'
  return `${move.piece.color}${move.piece.index}>${posKey(move.to)}x${kick}`
}

export function legalMoves(state: GameState): Move[] {
  const roll = state.pendingRoll
  if (state.status !== 'playing' || roll === undefined) return []
  const mover = state.turn
  const seen = new Set<string>()
  return getPlayer(state, mover)
    .pieces.flatMap((_, index) => GENERATORS.flatMap((generate) => generate(state, { color: mover, index }, roll)))
    .filter((move) => {
      const key = outcomeKey(move)
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
}
```

- [ ] **Step 6: Run the tests to see them pass**

Run: `npx vitest run && npx tsc --noEmit`
Expected: all pass, with no type errors.

---

### Task 4: Turn flow: roll, applyMove, pass, finishing

**Goal:** Write the state transitions: rolling, applying a validated move, passing, extra rolls on a 6, skipping finished players, and both end conditions.

**Files:**
- Create: `packages/engine/src/game.ts`
- Test: `packages/engine/test/game.test.ts`, `packages/engine/test/finishing.test.ts`

**Acceptance Criteria:**
- [ ] A roll with no legal move is wasted. A wasted 6 still gives the same player another roll.
- [ ] `applyMove` rejects moves that aren't legal and never changes its input.
- [ ] A 6 gives another roll, unless the mover has just finished.
- [ ] `firstWins` ends the game at the first finisher. `playForPlaces` ends it when one player is left and gives that player last place.

**Verify:** `npx vitest run test/game.test.ts test/finishing.test.ts` → all pass.

**Steps:**

- [ ] **Step 1: Write the failing tests**

`test/game.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { applyMove, pass, roll } from '../src/game'
import { legalMoves } from '../src/legalMoves'
import { BASE, HOME, lane, track } from '../src/position'
import { getPlayer } from '../src/state'
import { piece, setup } from './helpers'

describe('turn flow', () => {
  it('roll records the value and waits for a move', () => {
    const s = roll(setup({ pieces: { red: [5] } }), 3)
    expect(s.pendingRoll).toBe(3)
    expect(s.turn).toBe('red')
    expect(s.log).toEqual([{ type: 'roll', value: 3 }])
  })

  it('rejects a second roll before moving', () => {
    const s = roll(setup({ pieces: { red: [5] } }), 3)
    expect(() => roll(s, 2)).toThrow('roll already pending')
  })

  it('rejects values outside 1–6', () => {
    expect(() => roll(setup(), 7)).toThrow('invalid roll')
    expect(() => roll(setup(), 0)).toThrow('invalid roll')
  })

  it('wastes a roll with no legal move and passes the turn', () => {
    const s = roll(setup(), 3)
    expect(s.pendingRoll).toBeUndefined()
    expect(s.turn).toBe('green')
  })

  it('a wasted 6 still rolls again', () => {
    const s = roll(setup({ pieces: { red: [lane('red', 3), HOME, HOME, HOME] } }), 6)
    expect(s.pendingRoll).toBeUndefined()
    expect(s.turn).toBe('red')
  })

  it('applyMove moves the piece and passes the turn', () => {
    const s = roll(setup({ pieces: { red: [5] } }), 3)
    const next = applyMove(s, legalMoves(s)[0])
    expect(getPlayer(next, 'red').pieces[0]).toEqual(track(8))
    expect(next.turn).toBe('green')
    expect(next.pendingRoll).toBeUndefined()
  })

  it('a 6 gives another roll', () => {
    const s = roll(setup({ pieces: { red: [5] } }), 6)
    const move = legalMoves(s).find((m) => m.kind === 'forward')!
    expect(applyMove(s, move).turn).toBe('red')
  })

  it('a kick sends the opponent to base', () => {
    const s = roll(setup({ pieces: { red: [5], yellow: [8] } }), 3)
    expect(getPlayer(applyMove(s, legalMoves(s)[0]), 'yellow').pieces[0]).toEqual(BASE)
  })

  it('rejects an illegal move', () => {
    const s = roll(setup({ pieces: { red: [5] } }), 3)
    expect(() => applyMove(s, { kind: 'forward', piece: piece('red'), to: track(9) })).toThrow('illegal move')
  })

  it('never changes its input', () => {
    const s = roll(setup({ pieces: { red: [5], yellow: [8] } }), 3)
    const before = structuredClone(s)
    applyMove(s, legalMoves(s)[0])
    expect(s).toEqual(before)
  })

  it('pass drops the pending roll and moves on, even after a 6', () => {
    const s = pass(roll(setup({ pieces: { red: [5] } }), 6))
    expect(s.pendingRoll).toBeUndefined()
    expect(s.turn).toBe('green')
    expect(s.log.at(-1)).toEqual({ type: 'pass' })
  })

  it('turn order only includes seated colours', () => {
    expect(roll(setup({ players: 2 }), 3).turn).toBe('yellow')
  })
})
```

`test/finishing.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { applyMove, roll } from '../src/game'
import { legalMoves } from '../src/legalMoves'
import { HOME, lane } from '../src/position'
import { getPlayer } from '../src/state'
import { piece, setup } from './helpers'

const almostDone = { red: [lane('red', 4), HOME, HOME, HOME] }

describe('finishing', () => {
  it('reaching home needs an exact roll', () => {
    expect(legalMoves(setup({ roll: 3, pieces: almostDone }))).toEqual([])
    expect(legalMoves(setup({ roll: 2, pieces: almostDone }))).toEqual([
      { kind: 'forward', piece: piece('red'), to: HOME },
    ])
  })

  it('firstWins ends the game at the first finisher', () => {
    const s = roll(setup({ pieces: almostDone }), 2)
    const next = applyMove(s, legalMoves(s)[0])
    expect(next.status).toBe('finished')
    expect(getPlayer(next, 'red').finishedPlace).toBe(1)
    expect(getPlayer(next, 'green').finishedPlace).toBeUndefined()
    expect(() => roll(next, 3)).toThrow('game is over')
  })

  it('playForPlaces keeps going and skips the finished player, even after a 6', () => {
    const s = roll(
      setup({ players: 3, endCondition: 'playForPlaces', pieces: { red: [50, HOME, HOME, HOME] } }),
      6,
    )
    const next = applyMove(s, legalMoves(s)[0])
    expect(next.status).toBe('playing')
    expect(getPlayer(next, 'red').finishedPlace).toBe(1)
    expect(next.turn).toBe('green')
  })

  it('playForPlaces ends when one player is left', () => {
    const s = roll(setup({ players: 2, endCondition: 'playForPlaces', pieces: almostDone }), 2)
    const next = applyMove(s, legalMoves(s)[0])
    expect(next.status).toBe('finished')
    expect(getPlayer(next, 'red').finishedPlace).toBe(1)
    expect(getPlayer(next, 'yellow').finishedPlace).toBe(2)
  })
})
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run test/game.test.ts test/finishing.test.ts`
Expected: FAIL, because `../src/game` doesn't exist.

- [ ] **Step 3: Write `src/game.ts`**

```ts
import { legalMoves, outcomeKey } from './legalMoves'
import { BASE } from './position'
import { cloneState, createGame, getPlayer } from './state'
import type { Color, GameEvent, GameState, Move, PieceId, Position, Settings } from './types'

export function roll(state: GameState, value: number): GameState {
  if (state.status !== 'playing') throw new Error('game is over')
  if (state.pendingRoll !== undefined) throw new Error('roll already pending')
  if (!Number.isInteger(value) || value < 1 || value > 6) throw new Error('invalid roll')
  const next = cloneState(state)
  next.log.push({ type: 'roll', value })
  next.pendingRoll = value
  if (legalMoves(next).length === 0) endTurn(next, value)
  return next
}

export function applyMove(state: GameState, move: Move): GameState {
  const legal = legalMoves(state).find((m) => outcomeKey(m) === outcomeKey(move))
  if (!legal) throw new Error('illegal move')
  const rolled = state.pendingRoll
  const next = cloneState(state)
  next.log.push({ type: 'move', move: legal })
  setPosition(next, legal.piece, legal.to)
  if (legal.kick) setPosition(next, legal.kick, BASE)
  if (getPlayer(next, legal.piece.color).pieces.every((p) => p.kind === 'home')) finish(next, legal.piece.color)
  endTurn(next, rolled)
  return next
}

/** Server-side turn timeout: drop any pending roll and move to the next player. */
export function pass(state: GameState): GameState {
  if (state.status !== 'playing') throw new Error('game is over')
  const next = cloneState(state)
  next.log.push({ type: 'pass' })
  next.pendingRoll = undefined
  next.turn = nextActive(next, next.turn)
  return next
}

export function replay(settings: Settings, log: GameEvent[]): GameState {
  return log.reduce<GameState>((state, event) => {
    switch (event.type) {
      case 'roll':
        return roll(state, event.value)
      case 'move':
        return applyMove(state, event.move)
      case 'pass':
        return pass(state)
    }
  }, createGame(settings))
}

function setPosition(state: GameState, piece: PieceId, pos: Position): void {
  getPlayer(state, piece.color).pieces[piece.index] = pos
}

function nextActive(state: GameState, after: Color): Color {
  const seats = state.players
  const start = seats.findIndex((p) => p.color === after)
  for (let i = 1; i <= seats.length; i++) {
    const player = seats[(start + i) % seats.length]
    if (player.finishedPlace === undefined) return player.color
  }
  return after
}

function endTurn(state: GameState, rolled: number | undefined): void {
  state.pendingRoll = undefined
  if (state.status !== 'playing') return
  if (rolled === 6 && getPlayer(state, state.turn).finishedPlace === undefined) return
  state.turn = nextActive(state, state.turn)
}

function finish(state: GameState, color: Color): void {
  const placed = state.players.filter((p) => p.finishedPlace !== undefined).length
  getPlayer(state, color).finishedPlace = placed + 1
  if (state.settings.endCondition === 'firstWins') {
    state.status = 'finished'
    return
  }
  const remaining = state.players.filter((p) => p.finishedPlace === undefined)
  if (remaining.length === 1) {
    remaining[0].finishedPlace = placed + 2
    state.status = 'finished'
  }
}
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `npx vitest run && npx tsc --noEmit`
Expected: all pass, with no type errors.

---

### Task 5: Back Kick

**Goal:** When Back Kick is on, a track piece may move backwards by the roll, but only to land exactly on a lone opponent.

**Files:**
- Create: `packages/engine/src/moves/back.ts`
- Modify: `packages/engine/src/legalMoves.ts` (the imports and `GENERATORS`)
- Test: `packages/engine/test/backKick.test.ts`

**Acceptance Criteria:**
- [ ] A Back Kick happens only when the move lands on a lone opponent, and only when the toggle is on.
- [ ] It can go back past the player's own start square. A piece that lands on its own lane entry turns into its lane on its next forward move.
- [ ] A piece that has just entered can Back Kick. Pieces in their own home lane can't.
- [ ] Opponent blocks stop backward moves.

**Verify:** `npx vitest run test/backKick.test.ts` → all pass.

**Steps:**

- [ ] **Step 1: Write the failing test `test/backKick.test.ts`**

```ts
import { describe, expect, it } from 'vitest'
import { applyMove, roll } from '../src/game'
import { legalMoves } from '../src/legalMoves'
import { lane, track } from '../src/position'
import { getPlayer } from '../src/state'
import { piece, setup } from './helpers'

const rules = { backKick: true }
const backs = (s: Parameters<typeof legalMoves>[0]) => legalMoves(s).filter((m) => m.kind === 'back')

describe('back kick', () => {
  it('moves backwards onto a lone opponent and kicks it', () => {
    const s = setup({ rules, roll: 3, pieces: { red: [10], yellow: [7] } })
    expect(backs(s)).toEqual([{ kind: 'back', piece: piece('red'), to: track(7), kick: piece('yellow') }])
  })

  it('never moves backwards just to reposition', () => {
    expect(backs(setup({ rules, roll: 3, pieces: { red: [10] } }))).toEqual([])
  })

  it('is off by default', () => {
    expect(backs(setup({ roll: 3, pieces: { red: [10], yellow: [7] } }))).toEqual([])
  })

  it('can go back past your own start onto your lane entry, then turn into your lane', () => {
    const s = roll(setup({ rules, pieces: { red: [1], yellow: [50] } }), 3)
    const after = applyMove(s, backs(s)[0])
    expect(getPlayer(after, 'red').pieces[0]).toEqual(track(50))

    const nextTurn = setup({ rules, roll: 1, pieces: { red: [50] } })
    expect(legalMoves(nextTurn)).toContainEqual({ kind: 'forward', piece: piece('red'), to: lane('red', 1) })
  })

  it('a piece that just entered can back kick', () => {
    const s = setup({ rules, roll: 3, pieces: { red: [0], yellow: [49] } })
    expect(backs(s)).toHaveLength(1)
  })

  it('pieces in their own home lane cannot move backwards', () => {
    expect(backs(setup({ rules, roll: 3, pieces: { red: [lane('red', 2)], yellow: [50] } }))).toEqual([])
  })

  it('cannot pass an opponent block backwards', () => {
    const s = setup({ rules, roll: 4, pieces: { red: [10], yellow: [8, 8, 6] } })
    expect(backs(s)).toEqual([])
  })

  it('cannot kick a block', () => {
    expect(backs(setup({ rules, roll: 3, pieces: { red: [10], yellow: [7, 7] } }))).toEqual([])
  })
})
```

- [ ] **Step 2: Run the test to see it fail**

Run: `npx vitest run test/backKick.test.ts`
Expected: FAIL. No `back` moves are generated yet.

- [ ] **Step 3: Write `src/moves/back.ts`**

```ts
import { loneOpponent } from '../occupancy'
import { backwardPath, isClear } from '../path'
import { positionOf } from '../state'
import type { GameState, Move, PieceId } from '../types'

export function backMoves(state: GameState, piece: PieceId, roll: number): Move[] {
  if (!state.settings.rules.backKick) return []
  const path = backwardPath(positionOf(state, piece), roll)
  if (!path || !isClear(state, path, piece.color)) return []
  const to = path[path.length - 1]
  const kick = loneOpponent(state, to, piece.color)
  return kick ? [{ kind: 'back', piece, to, kick }] : []
}
```

- [ ] **Step 4: Register it in `src/legalMoves.ts`**

Replace:
```ts
import { enterMoves } from './moves/enter'
import { forwardMoves } from './moves/forward'
```
with:
```ts
import { backMoves } from './moves/back'
import { enterMoves } from './moves/enter'
import { forwardMoves } from './moves/forward'
```
and replace:
```ts
const GENERATORS: MoveGenerator[] = [enterMoves, forwardMoves]
```
with:
```ts
const GENERATORS: MoveGenerator[] = [enterMoves, forwardMoves, backMoves]
```

- [ ] **Step 5: Run the tests to see them pass**

Run: `npx vitest run && npx tsc --noEmit`
Expected: all pass, with no type errors.

---

### Task 6: Line Kick

**Goal:** After a legal forward move, or a backward move when Back Kick is also on, that lands on an empty or own square in rows 1–5, the mover may jump across the lane onto a lone opponent, as long as the lane square between them is empty.

**Files:**
- Create: `packages/engine/src/moves/line.ts`
- Modify: `packages/engine/src/legalMoves.ts` (the imports and `GENERATORS`)
- Test: `packages/engine/test/lineKick.test.ts`

**Acceptance Criteria:**
- [ ] The kicker ends up on the opponent's square.
- [ ] Any piece on the lane square between them blocks the kick. Row 0 never Line Kicks.
- [ ] It works across your own lane as a shortcut, and after a backward move only when both toggles are on.
- [ ] The landing square can't hold an opponent. A Line Kick can't target a block.
- [ ] A Line Kick with the same result as another move is merged into it.

**Verify:** `npx vitest run test/lineKick.test.ts` → all pass.

**Steps:**

- [ ] **Step 1: Write the failing test `test/lineKick.test.ts`**

```ts
import { describe, expect, it } from 'vitest'
import { applyMove, roll } from '../src/game'
import { legalMoves } from '../src/legalMoves'
import { BASE, lane, track } from '../src/position'
import { getPlayer } from '../src/state'
import type { GameState } from '../src/types'
import { piece, setup } from './helpers'

const rules = { lineKick: true }
const lines = (s: GameState) => legalMoves(s).filter((m) => m.kind === 'line')

describe('line kick', () => {
  it('lands, then jumps across the lane onto the opponent', () => {
    const s = setup({ rules, roll: 2, pieces: { red: [5], yellow: [15] } })
    expect(lines(s)).toEqual([
      { kind: 'line', piece: piece('red'), via: track(7), to: track(15), kick: piece('yellow') },
    ])
    expect(legalMoves(s)).toContainEqual({ kind: 'forward', piece: piece('red'), to: track(7) })
  })

  it('the kicker takes the opponent’s square', () => {
    const s = roll(setup({ rules, pieces: { red: [5], yellow: [15] } }), 2)
    const after = applyMove(s, lines(s)[0])
    expect(getPlayer(after, 'red').pieces[0]).toEqual(track(15))
    expect(getPlayer(after, 'yellow').pieces[0]).toEqual(BASE)
  })

  it('works when landing on your own piece', () => {
    expect(lines(setup({ rules, roll: 2, pieces: { red: [5, 7], yellow: [15] } }))).toHaveLength(1)
  })

  it('is blocked by any piece on the lane square between', () => {
    const s = setup({ rules, roll: 2, pieces: { red: [5], yellow: [15], green: [lane('green', 3)] } })
    expect(lines(s)).toEqual([])
  })

  it('never happens on row 0', () => {
    expect(lines(setup({ rules, roll: 2, pieces: { red: [8], yellow: [12] } }))).toEqual([])
  })

  it('works across your own lane as a shortcut', () => {
    const s = setup({ rules, roll: 1, pieces: { red: [0], yellow: [47] } })
    expect(lines(s)).toEqual([
      { kind: 'line', piece: piece('red'), via: track(1), to: track(47), kick: piece('yellow') },
    ])
  })

  it('whoever lands can kick, so the opponent can do it to you', () => {
    const s = setup({ rules, turn: 'yellow', roll: 2, pieces: { yellow: [5], red: [15] } })
    expect(lines(s)).toEqual([
      { kind: 'line', piece: piece('yellow'), via: track(7), to: track(15), kick: piece('red') },
    ])
  })

  it('after a backward move only when Back Kick is also on', () => {
    const pieces = { red: [9], yellow: [15] }
    expect(lines(setup({ rules: { lineKick: true, backKick: true }, roll: 2, pieces }))).toEqual([
      { kind: 'line', piece: piece('red'), via: track(7), to: track(15), kick: piece('yellow') },
    ])
    expect(lines(setup({ rules, roll: 2, pieces }))).toEqual([])
  })

  it('not when the landing square holds an opponent (that is a front kick)', () => {
    const s = setup({ rules, roll: 2, pieces: { red: [5], yellow: [7, 15] } })
    expect(legalMoves(s)).toEqual([{ kind: 'forward', piece: piece('red'), to: track(7), kick: piece('yellow') }])
  })

  it('cannot kick a block', () => {
    expect(lines(setup({ rules, roll: 2, pieces: { red: [5], yellow: [15, 15] } }))).toEqual([])
  })

  it('is off by default', () => {
    expect(lines(setup({ roll: 2, pieces: { red: [5], yellow: [15] } }))).toEqual([])
  })

  it('merges with a straight move that has the same result', () => {
    // Forward 3 from 11 kicks on 14. Back 3 to 8, then across green lane 2, also kicks on 14.
    const s = setup({ rules: { lineKick: true, backKick: true }, roll: 3, pieces: { red: [11], yellow: [14] } })
    expect(legalMoves(s)).toEqual([{ kind: 'forward', piece: piece('red'), to: track(14), kick: piece('yellow') }])
  })
})
```

- [ ] **Step 2: Run the test to see it fail**

Run: `npx vitest run test/lineKick.test.ts`
Expected: FAIL. No `line` moves are generated yet.

- [ ] **Step 3: Write `src/moves/line.ts`**

```ts
import { LINE_ACROSS } from '../board'
import { hasOpponent, loneOpponent, piecesAt } from '../occupancy'
import { backwardPath, forwardPath, isClear } from '../path'
import { track } from '../position'
import { positionOf } from '../state'
import type { GameState, Move, PieceId } from '../types'

export function lineMoves(state: GameState, piece: PieceId, roll: number): Move[] {
  const { lineKick, backKick } = state.settings.rules
  if (!lineKick) return []
  const from = positionOf(state, piece)
  const paths = [forwardPath(piece.color, from, roll), backKick ? backwardPath(from, roll) : null]
  return paths.flatMap((path): Move[] => {
    if (!path || !isClear(state, path, piece.color)) return []
    const via = path[path.length - 1]
    if (via.kind !== 'track' || hasOpponent(state, via, piece.color)) return []
    const pair = LINE_ACROSS.get(via.index)
    if (!pair || piecesAt(state, pair.between).length > 0) return []
    const to = track(pair.across)
    const kick = loneOpponent(state, to, piece.color)
    return kick ? [{ kind: 'line', piece, via, to, kick }] : []
  })
}
```

- [ ] **Step 4: Register it in `src/legalMoves.ts`**

Replace:
```ts
import { forwardMoves } from './moves/forward'
```
with:
```ts
import { forwardMoves } from './moves/forward'
import { lineMoves } from './moves/line'
```
and replace:
```ts
const GENERATORS: MoveGenerator[] = [enterMoves, forwardMoves, backMoves]
```
with:
```ts
const GENERATORS: MoveGenerator[] = [enterMoves, forwardMoves, backMoves, lineMoves]
```

- [ ] **Step 5: Run the tests to see them pass**

Run: `npx vitest run && npx tsc --noEmit`
Expected: all pass, with no type errors.

---

### Task 7: Home Kick

**Goal:** When Home Kick is on, a track piece may count past an opponent's lane entry and turn into that lane to land exactly on a lone opponent.

**Files:**
- Create: `packages/engine/src/moves/homeKick.ts`
- Modify: `packages/engine/src/legalMoves.ts` (the imports and `GENERATORS`)
- Test: `packages/engine/test/homeKick.test.ts`

**Acceptance Criteria:**
- [ ] It needs an exact count into the lane, and the kicker stays on the lane square.
- [ ] It works from a piece standing on the opponent's entry square.
- [ ] An invading piece leaves by moving back out toward the track, and can kick on the way.
- [ ] The lane's owner can kick an invader with a normal move.
- [ ] Opponent blocks stop it, and it only happens when the toggle is on.

**Verify:** `npx vitest run test/homeKick.test.ts` → all pass.

**Steps:**

- [ ] **Step 1: Write the failing test `test/homeKick.test.ts`**

```ts
import { describe, expect, it } from 'vitest'
import { legalMoves } from '../src/legalMoves'
import { lane, track } from '../src/position'
import type { GameState } from '../src/types'
import { piece, setup } from './helpers'

const rules = { homeKick: true }
const homeKicks = (s: GameState) => legalMoves(s).filter((m) => m.kind === 'homeKick')

describe('home kick', () => {
  it('turns into the opponent’s lane to kick on an exact count', () => {
    const s = setup({ rules, roll: 4, pieces: { red: [22], yellow: [lane('yellow', 2)] } })
    expect(homeKicks(s)).toEqual([
      { kind: 'homeKick', piece: piece('red'), to: lane('yellow', 2), kick: piece('yellow') },
    ])
    expect(legalMoves(s)).toContainEqual({ kind: 'forward', piece: piece('red'), to: track(26) })
  })

  it('needs an exact count', () => {
    expect(homeKicks(setup({ rules, roll: 4, pieces: { red: [22], yellow: [lane('yellow', 3)] } }))).toEqual([])
  })

  it('works from the opponent’s entry square', () => {
    expect(homeKicks(setup({ rules, roll: 3, pieces: { red: [24], yellow: [lane('yellow', 3)] } }))).toHaveLength(1)
  })

  it('the invader leaves by moving back out to the track', () => {
    const s = setup({ rules, roll: 4, pieces: { red: [lane('yellow', 2)] } })
    expect(legalMoves(s)).toEqual([{ kind: 'forward', piece: piece('red'), to: track(26) }])
  })

  it('the invader can kick on its way out', () => {
    const s = setup({ rules, roll: 3, pieces: { red: [lane('yellow', 2)], yellow: [25] } })
    expect(legalMoves(s)).toEqual([{ kind: 'forward', piece: piece('red'), to: track(25), kick: piece('yellow') }])
  })

  it('the lane owner can kick the invader', () => {
    const s = setup({ rules, turn: 'yellow', roll: 2, pieces: { yellow: [24], red: [lane('yellow', 2)] } })
    expect(legalMoves(s)).toContainEqual({
      kind: 'forward',
      piece: piece('yellow'),
      to: lane('yellow', 2),
      kick: piece('red'),
    })
  })

  it('is stopped by an opponent block on the way', () => {
    const s = setup({ rules, roll: 4, pieces: { red: [22], yellow: [lane('yellow', 2), 23, 23] } })
    expect(homeKicks(s)).toEqual([])
  })

  it('is off by default', () => {
    expect(homeKicks(setup({ roll: 4, pieces: { red: [22], yellow: [lane('yellow', 2)] } }))).toEqual([])
  })
})
```

- [ ] **Step 2: Run the test to see it fail**

Run: `npx vitest run test/homeKick.test.ts`
Expected: FAIL. No `homeKick` moves are generated yet.

- [ ] **Step 3: Write `src/moves/homeKick.ts`**

```ts
import { LANE_LENGTH, entryIndex } from '../board'
import { loneOpponent } from '../occupancy'
import { forwardPath, isClear } from '../path'
import { lane } from '../position'
import { positionOf } from '../state'
import { COLORS, type GameState, type Move, type PieceId } from '../types'

export function homeKickMoves(state: GameState, piece: PieceId, roll: number): Move[] {
  if (!state.settings.rules.homeKick) return []
  const from = positionOf(state, piece)
  if (from.kind !== 'track') return []
  // route[k] is where the piece stands after k normal steps.
  const route = [from, ...(forwardPath(piece.color, from, roll - 1) ?? [])]
  return route.flatMap((pos, k): Move[] => {
    if (pos.kind !== 'track') return []
    const index = pos.index
    const owner = COLORS.find((c) => c !== piece.color && entryIndex(c) === index)
    const depth = roll - k
    if (!owner || depth > LANE_LENGTH) return []
    const to = lane(owner, depth)
    const path = [...route.slice(1, k + 1), ...Array.from({ length: depth }, (_, i) => lane(owner, i + 1))]
    const kick = loneOpponent(state, to, piece.color)
    return kick && isClear(state, path, piece.color) ? [{ kind: 'homeKick', piece, to, kick }] : []
  })
}
```

- [ ] **Step 4: Register it in `src/legalMoves.ts`**

Replace:
```ts
import { forwardMoves } from './moves/forward'
import { lineMoves } from './moves/line'
```
with:
```ts
import { forwardMoves } from './moves/forward'
import { homeKickMoves } from './moves/homeKick'
import { lineMoves } from './moves/line'
```
and replace:
```ts
const GENERATORS: MoveGenerator[] = [enterMoves, forwardMoves, backMoves, lineMoves]
```
with:
```ts
const GENERATORS: MoveGenerator[] = [enterMoves, forwardMoves, backMoves, lineMoves, homeKickMoves]
```

- [ ] **Step 5: Run the tests to see them pass**

Run: `npx vitest run && npx tsc --noEmit`
Expected: all pass, with no type errors.

---

### Task 8: Labourer

**Goal:** When Labourer is on, kicking a player's last piece in play makes them the kicker's Labourer. Their rolls under 6 are then played by the owner, until the victim rolls a 6 or the owner finishes.

**Files:**
- Modify: `packages/engine/src/occupancy.ts` (add `hasPiecesInPlay`), `packages/engine/src/legalMoves.ts` (mover resolution), `packages/engine/src/game.ts` (`roll`, `applyMove`, `finish`)
- Test: `packages/engine/test/labourer.test.ts`

**Acceptance Criteria:**
- [ ] It triggers only when the victim has no pieces on the track or in a lane, and only when the toggle is on.
- [ ] The victim's rolls under 6 are moved by the owner, and then play passes to the player after the victim.
- [ ] If the owner has no legal move, the roll is wasted.
- [ ] A 6 ends the Labourer, the victim plays it, and the victim rolls again.
- [ ] An owner can gain several Labourers and can be Labourered themselves. Finishing releases their Labourers.

**Verify:** `npx vitest run test/labourer.test.ts` → all pass.

**Steps:**

- [ ] **Step 1: Write the failing test `test/labourer.test.ts`**

```ts
import { describe, expect, it } from 'vitest'
import { applyMove, roll } from '../src/game'
import { legalMoves } from '../src/legalMoves'
import { HOME, lane, track } from '../src/position'
import { getPlayer } from '../src/state'
import type { GameState } from '../src/types'
import { piece, setup, type SetupOptions } from './helpers'

const rules = { labourer: true }
const playFirst = (s: GameState, value: number) => {
  const rolled = roll(s, value)
  return applyMove(rolled, legalMoves(rolled)[0])
}

describe('labourer', () => {
  it('kicking the victim’s last piece in play makes them your labourer', () => {
    const s = playFirst(setup({ rules, pieces: { red: [5], yellow: [8] } }), 3)
    expect(s.labourers).toEqual({ yellow: 'red' })
  })

  it('not while the victim has another piece in play', () => {
    const s = playFirst(setup({ rules, pieces: { red: [5], yellow: [8, 30] } }), 3)
    expect(s.labourers).toEqual({})
  })

  it('pieces already home do not count as in play', () => {
    const s = playFirst(setup({ rules, pieces: { red: [5], yellow: [8, HOME, HOME, HOME] } }), 3)
    expect(s.labourers).toEqual({ yellow: 'red' })
  })

  it('is off by default', () => {
    expect(playFirst(setup({ pieces: { red: [5], yellow: [8] } }), 3).labourers).toEqual({})
  })

  const owned: SetupOptions = { rules, turn: 'yellow', labourers: { yellow: 'red' } }

  it('the owner plays the victim’s roll under 6, then play passes after the victim', () => {
    const s = roll(setup({ ...owned, pieces: { red: [5] } }), 3)
    expect(legalMoves(s)).toEqual([{ kind: 'forward', piece: piece('red'), to: track(8) }])
    expect(applyMove(s, legalMoves(s)[0]).turn).toBe('blue')
  })

  it('the roll is wasted if the owner cannot move', () => {
    const s = roll(setup(owned), 3)
    expect(s.pendingRoll).toBeUndefined()
    expect(s.turn).toBe('blue')
  })

  it('a 6 ends it, and the victim plays the 6 and rolls again', () => {
    const s = roll(setup({ ...owned, pieces: { red: [5] } }), 6)
    expect(s.labourers).toEqual({})
    expect(legalMoves(s).every((m) => m.piece.color === 'yellow')).toBe(true)
    expect(applyMove(s, legalMoves(s)[0]).turn).toBe('yellow')
  })

  it('an owner can gain a second labourer with a victim’s roll', () => {
    const s = playFirst(setup({ ...owned, pieces: { red: [5], green: [8] } }), 3)
    expect(s.labourers).toEqual({ yellow: 'red', green: 'red' })
  })

  it('an owner can be labourered while still owning someone', () => {
    const s = playFirst(
      setup({ rules, turn: 'green', labourers: { yellow: 'red' }, pieces: { red: [10], green: [7] } }),
      3,
    )
    expect(s.labourers).toEqual({ yellow: 'red', red: 'green' })
  })

  it('finishing releases the owner’s labourers', () => {
    const s = playFirst(
      setup({ ...owned, endCondition: 'playForPlaces', pieces: { red: [lane('red', 4), HOME, HOME, HOME] } }),
      2,
    )
    expect(getPlayer(s, 'red').finishedPlace).toBe(1)
    expect(s.labourers).toEqual({})
    expect(s.turn).toBe('blue')
  })
})
```

- [ ] **Step 2: Run the test to see it fail**

Run: `npx vitest run test/labourer.test.ts`
Expected: FAIL. `labourers` stays `{}`, and victims move their own pieces.

- [ ] **Step 3: Add `hasPiecesInPlay` to the end of `src/occupancy.ts`**

Add `isOnBoard` to the position import. Replace:
```ts
import { posKey } from './position'
```
with:
```ts
import { isOnBoard, posKey } from './position'
```
and append:
```ts

export const hasPiecesInPlay = (state: GameState, color: Color): boolean =>
  state.players.some((p) => p.color === color && p.pieces.some(isOnBoard))
```

- [ ] **Step 4: Resolve the mover in `src/legalMoves.ts`**

Replace:
```ts
import type { GameState, Move, PieceId } from './types'
```
with:
```ts
import type { Color, GameState, Move, PieceId } from './types'
```
Replace:
```ts
export function legalMoves(state: GameState): Move[] {
  const roll = state.pendingRoll
  if (state.status !== 'playing' || roll === undefined) return []
  const mover = state.turn
```
with:
```ts
const moverFor = (state: GameState, roll: number): Color =>
  roll < 6 ? (state.labourers[state.turn] ?? state.turn) : state.turn

/** Whose pieces the pending roll moves: the Labourer owner for a victim's roll under 6. */
export function currentMover(state: GameState): Color | undefined {
  return state.pendingRoll === undefined ? undefined : moverFor(state, state.pendingRoll)
}

export function legalMoves(state: GameState): Move[] {
  const roll = state.pendingRoll
  if (state.status !== 'playing' || roll === undefined) return []
  const mover = moverFor(state, roll)
```

- [ ] **Step 5: Update `src/game.ts`**

Add `hasPiecesInPlay`. Replace:
```ts
import { legalMoves, outcomeKey } from './legalMoves'
```
with:
```ts
import { legalMoves, outcomeKey } from './legalMoves'
import { hasPiecesInPlay } from './occupancy'
```

In `roll`, end the Labourer on a 6. Replace:
```ts
  next.pendingRoll = value
  if (legalMoves(next).length === 0) endTurn(next, value)
```
with:
```ts
  next.pendingRoll = value
  if (value === 6) delete next.labourers[next.turn]
  if (legalMoves(next).length === 0) endTurn(next, value)
```

In `applyMove`, create Labourers. Replace:
```ts
  if (legal.kick) setPosition(next, legal.kick, BASE)
```
with:
```ts
  if (legal.kick) {
    setPosition(next, legal.kick, BASE)
    if (next.settings.rules.labourer && !hasPiecesInPlay(next, legal.kick.color)) {
      next.labourers[legal.kick.color] = legal.piece.color
    }
  }
```

In `finish`, release the finished player's Labourers. Replace:
```ts
  getPlayer(state, color).finishedPlace = placed + 1
```
with:
```ts
  getPlayer(state, color).finishedPlace = placed + 1
  for (const [victim, owner] of Object.entries(state.labourers) as [Color, Color][]) {
    if (owner === color) delete state.labourers[victim]
  }
```

- [ ] **Step 6: Run the tests to see them pass**

Run: `npx vitest run && npx tsc --noEmit`
Expected: all pass, with no type errors.

---

### Task 9: Public API, replay and random-game invariants

**Goal:** Export the public API, prove that `replay` rebuilds the same state, and run seeded random games across random rulesets to check the invariants.

**Files:**
- Modify: `packages/engine/src/index.ts`
- Create: `packages/engine/test/random.ts`
- Test: `packages/engine/test/replay.test.ts`, `packages/engine/test/invariants.test.ts`

**Acceptance Criteria:**
- [ ] `replay(settings, log)` deep-equals the live state.
- [ ] 100 seeded random games with random settings all finish.
- [ ] After every step:
  - each player has 4 pieces
  - no square holds two colours
  - no legal move lands on an opponent block
  - every kick targets a lone piece
  - every Labourer victim has nothing in play
- [ ] `index.ts` exports the public API.

**Verify:** `npm test && npm run typecheck` (from the repo root) → all pass.

**Steps:**

- [ ] **Step 1: Write `test/random.ts`**

```ts
import { applyMove, roll } from '../src/game'
import { legalMoves } from '../src/legalMoves'
import { createGame } from '../src/state'
import type { GameState, Settings } from '../src/types'

/** mulberry32: small, fast, seeded. */
export function rng(seed: number): () => number {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function randomSettings(next: () => number): Settings {
  return {
    players: ([2, 3, 4] as const)[Math.floor(next() * 3)],
    rules: { backKick: next() < 0.5, lineKick: next() < 0.5, homeKick: next() < 0.5, labourer: next() < 0.5 },
    endCondition: next() < 0.5 ? 'firstWins' : 'playForPlaces',
  }
}

export function* playRandom(settings: Settings, seed: number, maxSteps = 200_000): Generator<GameState> {
  const next = rng(seed)
  let state = createGame(settings)
  for (let step = 0; step < maxSteps && state.status === 'playing'; step++) {
    if (state.pendingRoll === undefined) {
      state = roll(state, 1 + Math.floor(next() * 6))
    } else {
      const moves = legalMoves(state)
      state = applyMove(state, moves[Math.floor(next() * moves.length)])
    }
    yield state
  }
}
```

- [ ] **Step 2: Write `test/replay.test.ts`**

```ts
import { describe, expect, it } from 'vitest'
import { replay } from '../src/game'
import type { GameState } from '../src/types'
import { playRandom, randomSettings, rng } from './random'

describe('replay', () => {
  it.each([1, 2, 3, 4, 5])('rebuilds the same state from the log (seed %i)', (seed) => {
    let last: GameState | undefined
    for (const state of playRandom(randomSettings(rng(seed)), seed, 3000)) last = state
    expect(replay(last!.settings, last!.log)).toEqual(last)
  })
})
```

- [ ] **Step 3: Write `test/invariants.test.ts`**

```ts
import { describe, expect, it } from 'vitest'
import { legalMoves } from '../src/legalMoves'
import { hasPiecesInPlay, isOpponentBlock, piecesAt } from '../src/occupancy'
import { isOnBoard, posKey } from '../src/position'
import { positionOf } from '../src/state'
import type { Color, GameState } from '../src/types'
import { playRandom, randomSettings, rng } from './random'

function checkInvariants(state: GameState): void {
  const colorsAt = new Map<string, Set<Color>>()
  for (const player of state.players) {
    expect(player.pieces).toHaveLength(4)
    for (const pos of player.pieces.filter(isOnBoard)) {
      const key = posKey(pos)
      colorsAt.set(key, (colorsAt.get(key) ?? new Set()).add(player.color))
    }
  }
  for (const colors of colorsAt.values()) expect(colors.size).toBe(1)

  for (const move of legalMoves(state)) {
    expect(isOpponentBlock(state, move.to, move.piece.color)).toBe(false)
    if (move.kick) expect(piecesAt(state, positionOf(state, move.kick))).toHaveLength(1)
  }

  for (const [victim, owner] of Object.entries(state.labourers) as [Color, Color][]) {
    expect(victim).not.toBe(owner)
    expect(hasPiecesInPlay(state, victim)).toBe(false)
  }
}

describe('random games', () => {
  it.each(Array.from({ length: 100 }, (_, i) => i + 1))(
    'seed %i keeps the invariants and finishes',
    (seed) => {
      let last: GameState | undefined
      for (const state of playRandom(randomSettings(rng(seed)), seed)) {
        checkInvariants(state)
        last = state
      }
      expect(last?.status).toBe('finished')
    },
    30_000,
  )
})
```

- [ ] **Step 4: Run the new tests**

Run: `npx vitest run test/replay.test.ts test/invariants.test.ts`
Expected: all pass. If an invariant test fails, its seed reproduces the game. Debug it with superpowers-extended-cc:systematic-debugging before changing any rule code.

- [ ] **Step 5: Write `src/index.ts`**

```ts
export * from './types'
export { BASE, HOME, lane, track, posKey, samePos } from './position'
export { TRACK, LINE_ACROSS, startIndex, entryIndex, laneCell } from './board'
export { createGame, getPlayer, positionOf } from './state'
export { legalMoves, currentMover } from './legalMoves'
export { roll, applyMove, pass, replay } from './game'
```

- [ ] **Step 6: Full verification** (from the repo root)

Run: `npm test && npm run typecheck`
Expected: every test file passes, with no type errors.
