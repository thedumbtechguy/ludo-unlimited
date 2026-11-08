# Ludo Unlimited — Board UI Round 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers-extended-cc:subagent-driven-development (recommended) or superpowers-extended-cc:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A playable Ludo Unlimited on one device: home, setup, game board and results screens; 2–4 seats, each Human or Computer; saving and resuming; an installable PWA.

**Architecture:**
- A new workspace package, `packages/web` (Vite, React 18, TypeScript), uses `@ludo/engine` directly.
- The engine gains a sensible bot (`chooseMove`), a progress measure, and `movePath` for animation.
- The game logic stays pure in the engine. The web app keeps a `GameState` in a `useGame` hook, draws an SVG board, and lays real `<button>`s over it for interaction.

**Tech Stack:** TypeScript, React 18, Vite, Vitest with jsdom and Testing Library, vite-plugin-pwa, Playwright.

**User Verification:** YES. When the plan is done, the user plays a game in the browser and confirms it works and feels right (final task).

**Spec:** `docs/superpowers/specs/2026-11-08-board-ui-design.md` (Round 1 sections). Round 2 (effects) is out of scope.

**Repo rules:**
- Git repo on `main`. The user asked for a **commit after each task**, with a conventional message.
- **Never** add Co-Authored-By or any AI attribution.
- `git add` specific paths only.

**Engine facts you need** (`packages/engine`):
- Exports (from `src/index.ts`): the types (`Color`, `COLORS`, `Position`, `PieceId`, `Move`, `GameState`, `Settings`, `GameEvent`, `Rules`, `AfterKick`, `EndCondition`), `BASE`, `HOME`, `track`, `lane`, `posKey`, `samePos`, `TRACK`, `LINE_ACROSS`, `startIndex`, `entryIndex`, `laneCell`, `createGame`, `getPlayer`, `positionOf`, `legalMoves`, `currentMover`, `roll`, `applyMove`, `pass`, `replay`, `MODES`, `settingsFor`, `Mode`, `ModeName`.
- Board geometry:
  - `TRACK[i]` is the `[column,row]` cell (15×15 grid) of track square `i`.
  - `laneCell(color, 1..5)` is a lane cell.
  - Seat colours are `red` (top-left yard), `green` (top-right), `yellow` (bottom-right) and `blue` (bottom-left).
  - Start indices are 0/13/26/39. Lane entries are 50/11/24/37.
- `roll(state, value)` returns a new state. If no move is legal, it wastes the roll (`pendingRoll` stays `undefined`).
- `applyMove(state, move)` returns a new state, and throws if the move is illegal.
- `currentMover(state)` is the colour whose pieces the pending roll moves. That's the Labourer owner for a victim's roll under 6.
- `test/helpers.ts` has `setup({ roll, rules, pieces: { red: [5, lane('red', 2)] }, turn, labourers })`, where numbers are track indices, and `piece(color, index)`. `test/random.ts` has `rng(seed)` and `randomSettings(next)`.

---

### Task 0: Engine — progress, bot and movePath

**Goal:**
- `progress(color, pos)`: how far along its route a piece is.
- `chooseMove(state, random)`: the sensible bot.
- `movePath(state, move)`: every square a move visits, used for animation.
- Export these, plus `SEATS`, `forwardPath` and `backwardPath`.

**Files:**
- Create: `packages/engine/src/progress.ts`, `packages/engine/src/bot.ts`, `packages/engine/src/movePath.ts`
- Modify: `packages/engine/src/index.ts`
- Test: `packages/engine/test/bot.test.ts`, `packages/engine/test/movePath.test.ts`

**Acceptance Criteria:**
- [ ] `progress`: start square 0, own lane entry 50, own lane 51–55, home 56, base −1, the square behind start −1. An opponent's lane is measured by the way back out.
- [ ] `chooseMove` priority: finishing a piece, then a kick, then entering, then the furthest destination. Ties are broken by `random`. It returns `undefined` when there's no move.
- [ ] Bot-only games always finish, and the bot only picks legal moves.
- [ ] `movePath` returns the visited squares for forward, enter, back, line (including from base) and home kick moves.

**Verify:** `cd packages/engine && npx vitest run && npx tsc --noEmit` → all pass.

**Steps:**

- [ ] **Step 1: Write `test/bot.test.ts`**

```ts
import { describe, expect, it } from 'vitest'
import { chooseMove } from '../src/bot'
import { applyMove, roll } from '../src/game'
import { legalMoves } from '../src/legalMoves'
import { HOME, lane, track } from '../src/position'
import { progress } from '../src/progress'
import { createGame } from '../src/state'
import type { GameState } from '../src/types'
import { piece, setup } from './helpers'
import { randomSettings, rng } from './random'

const first = () => 0

describe('progress', () => {
  it('counts along the route from the start square', () => {
    expect(progress('red', track(0))).toBe(0)
    expect(progress('red', track(50))).toBe(50)
    expect(progress('red', lane('red', 3))).toBe(53)
    expect(progress('red', HOME)).toBe(56)
    expect(progress('green', track(13))).toBe(0)
  })

  it('treats the square behind your start as the very beginning', () => {
    expect(progress('red', track(51))).toBe(-1)
  })

  it('measures an opponent lane by the way back out', () => {
    expect(progress('red', lane('yellow', 2))).toBe(22)
  })
})

describe('chooseMove', () => {
  it('returns undefined with no legal move', () => {
    expect(chooseMove(setup({ roll: 3 }), first)).toBeUndefined()
  })

  it('finishing beats kicking', () => {
    const s = setup({ roll: 2, pieces: { red: [lane('red', 4), 20], yellow: [22] } })
    expect(chooseMove(s, first)?.to).toEqual(HOME)
  })

  it('kicking beats entering', () => {
    const s = setup({ roll: 6, pieces: { red: [5], yellow: [11] } })
    expect(chooseMove(s, first)?.kick).toEqual(piece('yellow'))
  })

  it('entering beats a plain move', () => {
    expect(chooseMove(setup({ roll: 6, pieces: { red: [5] } }), first)?.kind).toBe('enter')
  })

  it('otherwise moves the piece that ends furthest along', () => {
    expect(chooseMove(setup({ roll: 3, pieces: { red: [5, 30] } }), first)?.piece).toEqual(piece('red', 1))
  })

  it('breaks ties with the random source', () => {
    const s = setup({ roll: 3, pieces: { red: [5, 20], yellow: [8, 23] } })
    expect(chooseMove(s, () => 0)?.piece).toEqual(piece('red', 0))
    expect(chooseMove(s, () => 0.99)?.piece).toEqual(piece('red', 1))
  })

  it('only picks legal moves, and bot-only games finish', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const next = rng(seed)
      let state: GameState = createGame(randomSettings(rng(seed + 1000)))
      for (let step = 0; step < 100_000 && state.status === 'playing'; step++) {
        if (state.pendingRoll === undefined) {
          state = roll(state, 1 + Math.floor(next() * 6))
          continue
        }
        const move = chooseMove(state, next)!
        expect(legalMoves(state)).toContainEqual(move)
        state = applyMove(state, move)
      }
      expect(state.status).toBe('finished')
    }
  }, 60_000)
})
```

- [ ] **Step 2: Write `test/movePath.test.ts`**

```ts
import { describe, expect, it } from 'vitest'
import { legalMoves } from '../src/legalMoves'
import { movePath } from '../src/movePath'
import { lane, track } from '../src/position'
import type { GameState, Move } from '../src/types'
import { setup } from './helpers'

const find = (s: GameState, kind: Move['kind']) => legalMoves(s).find((m) => m.kind === kind)!

describe('movePath', () => {
  it('walks a forward move square by square', () => {
    const s = setup({ roll: 3, pieces: { red: [5] } })
    expect(movePath(s, find(s, 'forward'))).toEqual([track(6), track(7), track(8)])
  })

  it('enters straight onto the start square', () => {
    const s = setup({ roll: 6 })
    expect(movePath(s, find(s, 'enter'))).toEqual([track(0)])
  })

  it('walks backwards for a back kick', () => {
    const s = setup({ rules: { backKick: true }, roll: 3, pieces: { red: [10], yellow: [7] } })
    expect(movePath(s, find(s, 'back'))).toEqual([track(9), track(8), track(7)])
  })

  it('lands on the via square, then hops across for a line kick', () => {
    const s = setup({ rules: { lineKick: true }, roll: 2, pieces: { red: [5], yellow: [15] } })
    expect(movePath(s, find(s, 'line'))).toEqual([track(6), track(7), track(15)])
  })

  it('hops from the start square for a line kick on entering', () => {
    const s = setup({ rules: { lineKick: true }, roll: 6, pieces: { yellow: [48] } })
    expect(movePath(s, find(s, 'line'))).toEqual([track(0), track(48)])
  })

  it('turns into the lane for a home kick', () => {
    const s = setup({ rules: { homeKick: true }, roll: 4, pieces: { red: [22], yellow: [lane('yellow', 2)] } })
    expect(movePath(s, find(s, 'homeKick'))).toEqual([track(23), track(24), lane('yellow', 1), lane('yellow', 2)])
  })
})
```

- [ ] **Step 3: Run the tests to see them fail**

Run: `cd packages/engine && npx vitest run test/bot.test.ts test/movePath.test.ts`
Expected: FAIL, because the modules don't exist.

- [ ] **Step 4: Write `src/progress.ts`**

```ts
import { TRACK_LENGTH, entryIndex } from './board'
import type { Color, Position } from './types'

/**
 * How far along `color`'s route a position is: start square 0, own lane entry 50, own lane 51–55,
 * home 56, base −1. Measured by squares left to home, so kick shortcuts count as real progress.
 */
export function progress(color: Color, pos: Position): number {
  const toEntry = (index: number) => (entryIndex(color) - index + TRACK_LENGTH) % TRACK_LENGTH
  switch (pos.kind) {
    case 'base':
      return -1
    case 'home':
      return 56
    case 'track':
      return 50 - toEntry(pos.index)
    case 'lane':
      return pos.owner === color ? 50 + pos.index : 50 - pos.index - toEntry(entryIndex(pos.owner))
  }
}
```

- [ ] **Step 5: Write `src/bot.ts`**

```ts
import { legalMoves } from './legalMoves'
import { progress } from './progress'
import type { GameState, Move } from './types'

/** Higher is better: finish > kick > enter > furthest destination. */
function score(move: Move): number {
  if (move.to.kind === 'home') return 3000
  if (move.kick) return 2000
  if (move.kind === 'enter') return 1000
  return progress(move.piece.color, move.to)
}

/** The sensible bot: the best-scoring legal move, ties broken by `random` (0 ≤ r < 1). */
export function chooseMove(state: GameState, random: () => number): Move | undefined {
  const moves = legalMoves(state)
  if (moves.length === 0) return undefined
  const best = Math.max(...moves.map(score))
  const top = moves.filter((m) => score(m) === best)
  return top[Math.floor(random() * top.length)]
}
```

- [ ] **Step 6: Write `src/movePath.ts`**

```ts
import { entryIndex } from './board'
import { backwardPath, forwardPath } from './path'
import { lane, samePos } from './position'
import { positionOf } from './state'
import type { GameState, Move, Position } from './types'

/** Every square the moving piece visits, in order, ending at `move.to`. For animation. */
export function movePath(state: GameState, move: Move): Position[] {
  const color = move.piece.color
  const from = positionOf(state, move.piece)
  const roll = state.pendingRoll!
  const routes = (steps: number) => [forwardPath(color, from, steps), backwardPath(color, from, steps)]

  switch (move.kind) {
    case 'enter':
      return [move.to]
    case 'forward':
      return forwardPath(color, from, roll)!
    case 'back':
      return backwardPath(color, from, roll)!
    case 'line': {
      if (from.kind === 'base') return [move.via, move.to]
      const toVia = routes(roll).find((path) => path && samePos(path[path.length - 1], move.via))!
      return [...toVia, move.to]
    }
    case 'homeKick': {
      const to = move.to as Extract<Position, { kind: 'lane' }>
      const steps = roll - to.index
      const intoLane = Array.from({ length: to.index }, (_, i) => lane(to.owner, i + 1))
      const route = routes(steps).find((path) => {
        const last = steps === 0 ? from : path?.[path.length - 1]
        return last?.kind === 'track' && last.index === entryIndex(to.owner)
      })!
      return [...route, ...intoLane]
    }
  }
}
```

- [ ] **Step 7: Export from `src/index.ts`**

Append:
```ts
export { chooseMove } from './bot'
export { progress } from './progress'
export { movePath } from './movePath'
export { forwardPath, backwardPath } from './path'
export { SEATS } from './state'
```

- [ ] **Step 8: Run all engine tests and the typecheck**

Run: `cd packages/engine && npx vitest run && npx tsc --noEmit`
Expected: all pass.

- [ ] **Step 9: Commit**

```bash
git add packages/engine/src/progress.ts packages/engine/src/bot.ts packages/engine/src/movePath.ts packages/engine/src/index.ts packages/engine/test/bot.test.ts packages/engine/test/movePath.test.ts
git commit -m "feat(engine): sensible bot, progress measure and move paths"
```

---

### Task 1: Scaffold `packages/web`

**Goal:** A Vite, React and TypeScript app in the workspace, with Vitest and Testing Library, that renders a "Ludo Unlimited" heading.

**Files:**
- Create: `packages/web/package.json`, `packages/web/tsconfig.json`, `packages/web/vite.config.ts`, `packages/web/index.html`, `packages/web/src/main.tsx`, `packages/web/src/App.tsx`, `packages/web/src/styles.css`, `packages/web/src/test/setup.ts`
- Test: `packages/web/src/App.test.tsx`

**Acceptance Criteria:**
- [ ] `npm test` and `npm run typecheck` at the repo root run both packages and pass.
- [ ] `npm run dev -w @ludo/web` serves the app.

**Verify:** `npm test && npm run typecheck` (repo root) → all pass.

**Steps:**

- [ ] **Step 1: Write `packages/web/package.json`**

```json
{
  "name": "@ludo/web",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "typecheck": "tsc --noEmit",
    "e2e": "playwright test"
  },
  "dependencies": {
    "@ludo/engine": "*"
  }
}
```

- [ ] **Step 2: Install the dependencies** (from the repo root)

```bash
npm install -w @ludo/web react@18 react-dom@18
npm install -D -w @ludo/web vite @vitejs/plugin-react typescript vitest jsdom @testing-library/react @testing-library/user-event @testing-library/jest-dom @types/react@18 @types/react-dom@18
```

- [ ] **Step 3: Write `packages/web/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "jsx": "react-jsx",
    "types": ["vite/client"],
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true
  },
  "include": ["src", "vite.config.ts"]
}
```

- [ ] **Step 4: Write `packages/web/vite.config.ts`**

```ts
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
})
```

- [ ] **Step 5: Write `packages/web/src/test/setup.ts`**

```ts
import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

afterEach(() => cleanup())
```

- [ ] **Step 6: Write `packages/web/index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="theme-color" content="#3e63dd" />
    <title>Ludo Unlimited</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&family=Space+Grotesk:wght@600;700&display=swap" rel="stylesheet" />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 7: Write the failing test `src/App.test.tsx`**

```tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { App } from './App'

describe('App', () => {
  it('shows the game name', () => {
    render(<App />)
    expect(screen.getByRole('heading', { name: 'Ludo Unlimited' })).toBeInTheDocument()
  })
})
```

Run: `cd packages/web && npx vitest run`. Expected: FAIL, because `./App` doesn't exist.

- [ ] **Step 8: Write `src/App.tsx`, `src/main.tsx` and `src/styles.css`**

`src/App.tsx` (a placeholder, replaced in Task 5):
```tsx
export function App() {
  return (
    <main className="screen home">
      <h1>Ludo Unlimited</h1>
    </main>
  )
}
```

`src/main.tsx` (a placeholder, replaced in Task 5):
```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import './styles.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
```

`src/styles.css`, the full stylesheet for Round 1:
```css
:root {
  --bg: #eef2f7;
  --ink: #0f172a;
  --muted: #475569;
  --line: #cbd5e1;
  --accent: #3e63dd;
  font-family: Inter, system-ui, sans-serif;
  color: var(--ink);
  background: var(--bg);
}
* { box-sizing: border-box; }
body { margin: 0; min-height: 100vh; background: var(--bg); }
h1, h2 { font-family: 'Space Grotesk', Inter, sans-serif; letter-spacing: -0.5px; margin: 0; }
button { font: inherit; color: var(--ink); }

.screen { max-width: 1200px; margin: 0 auto; padding: 16px; }
.home, .setup, .results { max-width: 560px; display: flex; flex-direction: column; gap: 16px; }
.home p, .setup p { margin: 0; color: var(--muted); }

.primary { background: var(--accent); color: #ffffff; border: 0; border-radius: 12px; padding: 14px 20px; font-weight: 600; min-height: 48px; cursor: pointer; }
.secondary { background: #ffffff; border: 1px solid var(--line); border-radius: 12px; padding: 12px 18px; min-height: 44px; cursor: pointer; }

fieldset { border: 1px solid var(--line); border-radius: 12px; padding: 12px 16px; display: flex; flex-wrap: wrap; gap: 4px 20px; background: #ffffff; margin: 0; }
legend { font-weight: 600; padding: 0 4px; }
label { display: inline-flex; align-items: center; gap: 8px; min-height: 44px; }
select { font: inherit; padding: 8px; border-radius: 8px; border: 1px solid var(--line); background: #ffffff; }
details { background: #ffffff; border: 1px solid var(--line); border-radius: 12px; padding: 12px 16px; }
summary { cursor: pointer; font-weight: 600; min-height: 32px; }
.seat { display: inline-flex; align-items: center; gap: 8px; }
.actions { display: flex; gap: 12px; justify-content: flex-end; flex-wrap: wrap; }

.game { display: grid; gap: 16px; grid-template-columns: minmax(0, 1fr); }
@media (min-width: 900px) and (orientation: landscape) {
  .game { grid-template-columns: minmax(0, calc(100vh - 32px)) 320px; justify-content: center; align-items: start; }
}

.board { position: relative; width: 100%; aspect-ratio: 1 / 1; }
.board svg { display: block; width: 100%; height: 100%; }
.piece { transition: transform 120ms linear; }
.piece.movable > .body { animation: pulse 0.9s ease-in-out infinite alternate; transform-box: fill-box; transform-origin: center; }
@keyframes pulse { to { transform: scale(1.18); } }
@media (prefers-reduced-motion: reduce) {
  .piece { transition: none; }
  .piece.movable > .body { animation: none; stroke: var(--ink); }
}
.hit { position: absolute; width: max(44px, 6.6%); aspect-ratio: 1 / 1; transform: translate(-50%, -50%); border: 0; border-radius: 50%; background: transparent; cursor: pointer; padding: 0; }
.hit:focus-visible { outline: 3px solid var(--ink); outline-offset: 2px; }
.labourer-badge { position: absolute; transform: translate(-50%, 0); background: var(--ink); color: #ffffff; font-size: 12px; font-weight: 600; padding: 4px 8px; border-radius: 999px; pointer-events: none; white-space: nowrap; }

.panel { display: flex; flex-direction: column; gap: 16px; }
.banner { margin: 0; padding: 12px 16px; border-radius: 14px; font-weight: 700; font-size: 20px; }
.dice { align-self: center; width: 120px; height: 120px; border-radius: 24px; border: 0; background: #ffffff; box-shadow: 0 10px 24px rgba(15, 23, 42, 0.18); cursor: pointer; padding: 18px; }
.dice:disabled { opacity: 0.55; cursor: default; }
.pips { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; width: 100%; height: 100%; }
.pip { border-radius: 50%; }
.pip.on { background: var(--ink); }
.hint { margin: 0; text-align: center; color: var(--muted); min-height: 20px; }
.message { min-height: 24px; margin: 0; font-weight: 600; text-align: center; }

.results ol { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 8px; }
.results li { display: flex; align-items: center; gap: 12px; background: #ffffff; border-radius: 12px; padding: 12px 16px; font-weight: 600; }
.dot { width: 16px; height: 16px; border-radius: 50%; flex: none; }
```

- [ ] **Step 9: Verify**

Run (repo root): `npm test && npm run typecheck`
Expected: the engine and web tests pass, and both typechecks are clean.

- [ ] **Step 10: Commit**

```bash
git add packages/web package-lock.json
git commit -m "chore(web): scaffold Vite React app"
```

---

### Task 2: Board layout, theme and labels

**Goal:** Pure helpers:
- where each position and piece is drawn on the 600×600 board
- the 72 path tiles
- how stacked pieces fan out
- the colour palette
- accessible labels and kick messages

**Files:**
- Create: `packages/web/src/layout.ts`, `packages/web/src/theme.ts`, `packages/web/src/labels.ts`
- Test: `packages/web/src/layout.test.ts`, `packages/web/src/labels.test.ts`

**Acceptance Criteria:**
- [ ] The track, lane, base and home points match the board grid (40 px squares).
- [ ] `TILES` has 72 entries, and exactly 4 track tiles are coloured (the start squares).
- [ ] Stacked pieces get distinct points and a `stack` count. A `moving` override moves one piece.
- [ ] Labels read like "Red piece 1, on square 9", and messages like "Red Line Kicked Yellow!".

**Verify:** `cd packages/web && npx vitest run src/layout.test.ts src/labels.test.ts` → pass.

**Steps:**

- [ ] **Step 1: Write `src/layout.test.ts`**

```ts
import { createGame, lane, settingsFor, startIndex, track, TRACK } from '@ludo/engine'
import { describe, expect, it } from 'vitest'
import { TILES, placements, positionPoint } from './layout'

const red0 = { color: 'red', index: 0 } as const

describe('layout', () => {
  it('has 72 path tiles; only the 4 start squares on the track are coloured', () => {
    expect(TILES).toHaveLength(72)
    const trackTiles = TILES.slice(0, TRACK.length)
    expect(trackTiles.filter((t) => t.fill !== null)).toHaveLength(4)
    expect(trackTiles[startIndex('green')].fill).toBe('green')
  })

  it('places positions on the 40px grid', () => {
    expect(positionPoint(track(0), red0)).toEqual({ x: 60, y: 260 })
    expect(positionPoint(lane('red', 1), red0)).toEqual({ x: 60, y: 300 })
    expect(positionPoint({ kind: 'base' }, red0)).toEqual({ x: 80, y: 80 })
    expect(positionPoint({ kind: 'base' }, { color: 'green', index: 3 })).toEqual({ x: 520, y: 160 })
    expect(positionPoint({ kind: 'home' }, { color: 'yellow', index: 0 })).toEqual({ x: 330, y: 300 })
  })

  it('places every piece, fanning out stacks', () => {
    const state = createGame(settingsFor('classic', 4, 'firstWins'))
    expect(placements(state)).toHaveLength(16)
    state.players[0].pieces[0] = track(5)
    state.players[0].pieces[1] = track(5)
    const stacked = placements(state).filter((p) => p.piece.color === 'red' && p.piece.index < 2)
    expect(stacked.map((p) => p.stack)).toEqual([2, 2])
    expect(stacked[0].point).not.toEqual(stacked[1].point)
  })

  it('draws a moving piece where the animation says', () => {
    const state = createGame(settingsFor('classic', 2, 'firstWins'))
    const moved = placements(state, { piece: red0, at: track(0) }).find((p) => p.piece.color === 'red' && p.piece.index === 0)
    expect(moved?.point).toEqual({ x: 60, y: 260 })
  })
})
```

- [ ] **Step 2: Write `src/labels.test.ts`**

```ts
import { lane, track } from '@ludo/engine'
import { describe, expect, it } from 'vitest'
import { describePosition, kickMessage, pieceLabel, targetLabel } from './labels'

describe('labels', () => {
  it('describes positions', () => {
    expect(describePosition({ kind: 'base' })).toBe('in base')
    expect(describePosition({ kind: 'home' })).toBe('home')
    expect(describePosition(track(8))).toBe('on square 9')
    expect(describePosition(lane('yellow', 2))).toBe("in Yellow's home lane, square 2")
  })

  it('labels pieces and targets', () => {
    expect(pieceLabel({ color: 'red', index: 0 }, track(8))).toBe('Red piece 1, on square 9')
    expect(targetLabel({ kind: 'forward', piece: { color: 'red', index: 0 }, to: track(8) })).toBe('Move on square 9')
    expect(
      targetLabel({ kind: 'forward', piece: { color: 'red', index: 0 }, to: track(8), kick: { color: 'yellow', index: 0 } }),
    ).toBe('Kick Yellow on square 9')
  })

  it('announces kicks by kind', () => {
    const piece = { color: 'red', index: 0 } as const
    const kick = { color: 'yellow', index: 0 } as const
    expect(kickMessage({ kind: 'line', piece, via: track(7), to: track(15), kick })).toBe('Red Line Kicked Yellow!')
    expect(kickMessage({ kind: 'forward', piece, to: track(8), kick })).toBe('Red kicked Yellow!')
    expect(kickMessage({ kind: 'forward', piece, to: track(8) })).toBeUndefined()
  })
})
```

- [ ] **Step 3: Run the tests to see them fail**

Run: `cd packages/web && npx vitest run src/layout.test.ts src/labels.test.ts`
Expected: FAIL, because the modules don't exist.

- [ ] **Step 4: Write `src/theme.ts`**

```ts
import type { Color } from '@ludo/engine'

export const COLOR_HEX: Record<Color, string> = {
  red: '#e5484d',
  green: '#30a46c',
  yellow: '#f5b301',
  blue: '#3e63dd',
}

/** Text that stays readable on each colour. */
export const ON_COLOR: Record<Color, string> = {
  red: '#ffffff',
  green: '#ffffff',
  yellow: '#0f172a',
  blue: '#ffffff',
}

export const BOARD_BG = '#cbd5e1'
export const TILE = '#ffffff'
export const MOVE_MARK = '#3e63dd'
export const KICK_MARK = '#e5484d'
```

- [ ] **Step 5: Write `src/layout.ts`**

```ts
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
  return [...groups.values()].flatMap((group) =>
    group.map(({ piece, at }, i) => {
      const base = positionPoint(at, piece)
      const offset = (i - (group.length - 1) / 2) * 6
      return { piece, point: { x: base.x + offset, y: base.y + offset }, stack: group.length, top: i === group.length - 1 }
    }),
  )
}
```

- [ ] **Step 6: Write `src/labels.ts`**

```ts
import type { Color, Move, PieceId, Position } from '@ludo/engine'

export const COLOR_NAME: Record<Color, string> = { red: 'Red', green: 'Green', yellow: 'Yellow', blue: 'Blue' }

export function describePosition(pos: Position): string {
  switch (pos.kind) {
    case 'base':
      return 'in base'
    case 'home':
      return 'home'
    case 'track':
      return `on square ${pos.index + 1}`
    case 'lane':
      return `in ${COLOR_NAME[pos.owner]}'s home lane, square ${pos.index}`
  }
}

export const pieceLabel = (piece: PieceId, pos: Position): string =>
  `${COLOR_NAME[piece.color]} piece ${piece.index + 1}, ${describePosition(pos)}`

export const targetLabel = (move: Move): string =>
  move.kick ? `Kick ${COLOR_NAME[move.kick.color]} ${describePosition(move.to)}` : `Move ${describePosition(move.to)}`

const KICK_VERB: Record<Move['kind'], string> = {
  enter: 'kicked',
  forward: 'kicked',
  back: 'Back Kicked',
  line: 'Line Kicked',
  homeKick: 'Home Kicked',
}

export const kickMessage = (move: Move): string | undefined =>
  move.kick ? `${COLOR_NAME[move.piece.color]} ${KICK_VERB[move.kind]} ${COLOR_NAME[move.kick.color]}!` : undefined
```

- [ ] **Step 7: Run the tests to see them pass**

Run: `cd packages/web && npx vitest run && npx tsc --noEmit`
Expected: all pass.

- [ ] **Step 8: Commit**

```bash
git add packages/web/src/layout.ts packages/web/src/theme.ts packages/web/src/labels.ts packages/web/src/layout.test.ts packages/web/src/labels.test.ts
git commit -m "feat(web): board layout, theme and labels"
```

---

### Task 3: Board component

**Goal:** An SVG board in Look B with real `<button>`s laid over it:
- movable pieces pulse and can be selected
- the selected piece's targets show markers (blue for a move, red for a kick)
- Labourer badges sit on the victims' yards
- a `moving` override draws an animated piece

**Files:**
- Create: `packages/web/src/components/Board.tsx`
- Test: `packages/web/src/components/Board.test.tsx`

**Acceptance Criteria:**
- [ ] It draws 72 tiles and one piece per seated piece.
- [ ] Movable pieces are buttons labelled with `pieceLabel`, and clicking one calls `onSelectPiece`.
- [ ] Targets are buttons labelled with `targetLabel`, and clicking one calls `onPickTarget`. Each target has one marker.
- [ ] Labourer victims show "Labourer to <Owner>".
- [ ] A moving piece is drawn at its override position.

**Verify:** `cd packages/web && npx vitest run src/components/Board.test.tsx` → pass.

**Steps:**

- [ ] **Step 1: Write `src/components/Board.test.tsx`**

```tsx
import { createGame, settingsFor, track, type Move } from '@ludo/engine'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Board } from './Board'

const game = (players: 2 | 3 | 4 = 4) => createGame(settingsFor('classic', players, 'firstWins'))
const red0 = { color: 'red', index: 0 } as const

describe('Board', () => {
  it('draws 72 path tiles and every seated piece', () => {
    render(<Board state={game()} />)
    expect(screen.getAllByTestId('tile')).toHaveLength(72)
    expect(screen.getAllByTestId('piece')).toHaveLength(16)
  })

  it('draws only the seated colours’ pieces', () => {
    render(<Board state={game(2)} />)
    expect(screen.getAllByTestId('piece')).toHaveLength(8)
  })

  it('makes movable pieces buttons that select', async () => {
    const onSelectPiece = vi.fn()
    render(<Board state={game()} movable={[red0]} onSelectPiece={onSelectPiece} />)
    await userEvent.click(screen.getByRole('button', { name: 'Red piece 1, in base' }))
    expect(onSelectPiece).toHaveBeenCalledWith(red0)
  })

  it('makes targets buttons that pick the move', async () => {
    const onPickTarget = vi.fn()
    const move: Move = { kind: 'forward', piece: red0, to: track(8), kick: { color: 'yellow', index: 0 } }
    render(<Board state={game()} selected={red0} targets={[move]} onPickTarget={onPickTarget} />)
    expect(screen.getAllByTestId('target-marker')).toHaveLength(1)
    await userEvent.click(screen.getByRole('button', { name: 'Kick Yellow on square 9' }))
    expect(onPickTarget).toHaveBeenCalledWith(move)
  })

  it('shows a labourer badge on the victim’s yard', () => {
    const state = game()
    state.labourers = { yellow: 'red' }
    render(<Board state={state} />)
    expect(screen.getByText('Labourer to Red')).toBeInTheDocument()
  })

  it('draws a moving piece at its animated square', () => {
    render(<Board state={game()} moving={{ piece: red0, at: track(0) }} />)
    const piece = screen.getAllByTestId('piece').find((el) => el.getAttribute('data-piece') === 'red-0')!
    expect(piece.style.transform).toBe('translate(60px, 260px)')
  })
})
```

- [ ] **Step 2: Run the test to see it fail**

Run: `cd packages/web && npx vitest run src/components/Board.test.tsx`
Expected: FAIL, because the module doesn't exist.

- [ ] **Step 3: Write `src/components/Board.tsx`**

```tsx
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
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `cd packages/web && npx vitest run && npx tsc --noEmit`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/components/Board.tsx packages/web/src/components/Board.test.tsx
git commit -m "feat(web): SVG board with piece and target buttons"
```

---

### Task 4: Dice, saving and the `useGame` hook

**Goal:**
- Dice sources: random, fixed and seeded.
- localStorage save and load.
- `useGame`, which runs a game: rolling, selecting, playing, square-by-square animation, computer seats, kick messages and change reporting.

**Files:**
- Create: `packages/web/src/dice.ts`, `packages/web/src/types.ts`, `packages/web/src/storage.ts`, `packages/web/src/useGame.ts`
- Test: `packages/web/src/dice.test.ts`, `packages/web/src/storage.test.ts`, `packages/web/src/useGame.test.ts`

**Acceptance Criteria:**
- [ ] `randomDice` gives 1–6. `fixedDice` cycles through its values. `seededDice` is deterministic.
- [ ] `saveGame`/`loadGame` round-trip. `loadGame` returns `undefined` when nothing is saved, when storage throws, or when the log won't replay.
- [ ] Selecting a piece with one move plays it. With several moves, selecting shows its targets.
- [ ] A wasted roll sets the message "No moves". A kick sets the kick message.
- [ ] With `step > 0`, a move animates through `movePath` before the state changes.
- [ ] Computer seats play a whole game by themselves.
- [ ] `onChange` gets every new state.

**Verify:** `cd packages/web && npx vitest run src/dice.test.ts src/storage.test.ts src/useGame.test.ts` → pass.

**Steps:**

- [ ] **Step 1: Write the tests**

`src/dice.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { fixedDice, randomDice, seededDice } from './dice'

describe('dice', () => {
  it('random dice roll 1 to 6', () => {
    const rolls = Array.from({ length: 600 }, randomDice)
    expect(rolls.every((r) => r >= 1 && r <= 6 && Number.isInteger(r))).toBe(true)
    expect(new Set(rolls).size).toBe(6)
  })

  it('fixed dice cycle through their values', () => {
    const dice = fixedDice([6, 2])
    expect([dice(), dice(), dice()]).toEqual([6, 2, 6])
  })

  it('seeded dice repeat for the same seed', () => {
    const a = seededDice(7)
    const b = seededDice(7)
    const rollsA = Array.from({ length: 20 }, a)
    expect(Array.from({ length: 20 }, b)).toEqual(rollsA)
    expect(rollsA.every((r) => r >= 1 && r <= 6)).toBe(true)
  })
})
```

`src/storage.test.ts`:
```ts
import { createGame, roll, settingsFor } from '@ludo/engine'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearGame, loadGame, saveGame } from './storage'

const settings = settingsFor('ghana', 2, 'firstWins')

describe('storage', () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => vi.restoreAllMocks())

  it('round-trips a saved game', () => {
    const log = roll(createGame(settings), 3).log
    saveGame({ settings, seats: { red: 'human', yellow: 'computer' }, log })
    expect(loadGame()).toEqual({ settings, seats: { red: 'human', yellow: 'computer' }, log })
  })

  it('is empty when nothing is saved, or after clearing', () => {
    expect(loadGame()).toBeUndefined()
    saveGame({ settings, seats: {}, log: [] })
    clearGame()
    expect(loadGame()).toBeUndefined()
  })

  it('ignores a log that no longer replays', () => {
    saveGame({ settings, seats: {}, log: [{ type: 'roll', value: 9 }] })
    expect(loadGame()).toBeUndefined()
  })

  it('survives storage that throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(() => saveGame({ settings, seats: {}, log: [] })).not.toThrow()
    expect(loadGame()).toBeUndefined()
  })
})
```

`src/useGame.test.ts`:
```ts
import { createGame, settingsFor, track } from '@ludo/engine'
import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fixedDice, seededDice } from './dice'
import { FAST_TIMING, useGame } from './useGame'

const classic2 = settingsFor('classic', 2, 'firstWins')
const humans = { red: 'human', yellow: 'human' } as const
const red0 = { color: 'red', index: 0 } as const

describe('useGame', () => {
  afterEach(() => vi.useRealTimers())

  it('a human rolls; a piece with one move plays when selected; a 6 rolls again', () => {
    const { result } = renderHook(() => useGame({ settings: classic2, seats: humans, dice: fixedDice([6]), timing: FAST_TIMING }))
    expect(result.current.humanToRoll).toBe(true)
    act(() => result.current.roll())
    expect(result.current.movable).toEqual([red0])
    act(() => result.current.select(red0))
    expect(result.current.game.players[0].pieces[0]).toEqual(track(0))
    expect(result.current.humanToRoll).toBe(true)
  })

  it('a piece with several moves shows its targets; picking one plays it', () => {
    const initial = createGame(settingsFor('ghana', 2, 'firstWins'))
    initial.players[0].pieces[0] = track(10)
    initial.players[1].pieces[0] = track(7)
    const { result } = renderHook(() =>
      useGame({ settings: initial.settings, seats: humans, dice: fixedDice([3]), timing: FAST_TIMING, initial }),
    )
    act(() => result.current.roll())
    act(() => result.current.select(red0))
    expect(result.current.targets.map((m) => m.kind).sort()).toEqual(['back', 'forward'])
    act(() => result.current.play(result.current.targets.find((m) => m.kind === 'back')!))
    expect(result.current.game.players[1].pieces[0]).toEqual({ kind: 'base' })
    expect(result.current.message).toBe('Red Back Kicked Yellow!')
  })

  it('a wasted roll says so and passes the turn', () => {
    const { result } = renderHook(() => useGame({ settings: classic2, seats: humans, dice: fixedDice([3]), timing: FAST_TIMING }))
    act(() => result.current.roll())
    expect(result.current.message).toBe('No moves')
    expect(result.current.game.turn).toBe('yellow')
  })

  it('animates a move square by square before applying it', () => {
    vi.useFakeTimers()
    const initial = createGame(classic2)
    initial.players[0].pieces[0] = track(5)
    const timing = { botRoll: 0, botMove: 0, step: 100 }
    const { result } = renderHook(() => useGame({ settings: classic2, seats: humans, dice: fixedDice([3]), timing, initial }))
    act(() => result.current.roll())
    act(() => result.current.select(red0))
    expect(result.current.moving).toEqual({ piece: red0, at: track(6) })
    expect(result.current.game.players[0].pieces[0]).toEqual(track(5))
    act(() => vi.advanceTimersByTime(100))
    expect(result.current.moving?.at).toEqual(track(7))
    act(() => vi.advanceTimersByTime(100))
    expect(result.current.moving?.at).toEqual(track(8))
    act(() => vi.advanceTimersByTime(100))
    expect(result.current.moving).toBeUndefined()
    expect(result.current.game.players[0].pieces[0]).toEqual(track(8))
  })

  it('computer seats play a whole game by themselves', async () => {
    vi.useFakeTimers()
    const { result } = renderHook(() =>
      useGame({ settings: classic2, seats: { red: 'computer', yellow: 'computer' }, dice: seededDice(3), timing: FAST_TIMING, random: () => 0 }),
    )
    for (let i = 0; i < 20_000 && result.current.game.status === 'playing'; i++) {
      await act(async () => {
        vi.runOnlyPendingTimers()
      })
    }
    expect(result.current.game.status).toBe('finished')
  }, 30_000)

  it('reports every new state', () => {
    const onChange = vi.fn()
    const { result } = renderHook(() =>
      useGame({ settings: classic2, seats: humans, dice: fixedDice([3]), timing: FAST_TIMING, onChange }),
    )
    act(() => result.current.roll())
    expect(onChange).toHaveBeenLastCalledWith(result.current.game)
    expect(result.current.game.log).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `cd packages/web && npx vitest run src/dice.test.ts src/storage.test.ts src/useGame.test.ts`
Expected: FAIL, because the modules don't exist.

- [ ] **Step 3: Write `src/dice.ts`**

```ts
export type Dice = () => number

export const randomDice: Dice = () => (crypto.getRandomValues(new Uint32Array(1))[0] % 6) + 1

export function fixedDice(values: number[]): Dice {
  let i = 0
  return () => values[i++ % values.length]
}

/** mulberry32: deterministic dice for tests and `?seed=` URLs. */
export function seededDice(seed: number): Dice {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return 1 + Math.floor((((t ^ (t >>> 14)) >>> 0) / 4294967296) * 6)
  }
}
```

- [ ] **Step 4: Write `src/types.ts`**

```ts
import type { Color } from '@ludo/engine'

export type Seat = 'human' | 'computer'
export type Seats = Partial<Record<Color, Seat>>
```

- [ ] **Step 5: Write `src/storage.ts`**

```ts
import { replay, type GameEvent, type Settings } from '@ludo/engine'
import type { Seats } from './types'

export type SavedGame = { settings: Settings; seats: Seats; log: GameEvent[] }

const KEY = 'ludo-unlimited:game'

export function saveGame(saved: SavedGame): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(saved))
  } catch {
    // Storage blocked or full: the game still plays, it just can't be resumed.
  }
}

/** The saved game, if there is one and its log still replays. */
export function loadGame(): SavedGame | undefined {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return undefined
    const saved = JSON.parse(raw) as SavedGame
    replay(saved.settings, saved.log)
    return saved
  } catch {
    return undefined
  }
}

export function clearGame(): void {
  try {
    localStorage.removeItem(KEY)
  } catch {
    // Nothing to clear when storage is blocked.
  }
}
```

- [ ] **Step 6: Write `src/useGame.ts`**

```ts
import {
  applyMove,
  chooseMove,
  createGame,
  currentMover,
  legalMoves,
  movePath,
  replay,
  roll as rollDice,
  type Color,
  type GameEvent,
  type GameState,
  type Move,
  type PieceId,
  type Position,
  type Settings,
} from '@ludo/engine'
import { useEffect, useState } from 'react'
import type { Dice } from './dice'
import { kickMessage } from './labels'
import type { Moving } from './layout'
import type { Seats } from './types'

export type Timing = { botRoll: number; botMove: number; step: number }
export const NORMAL_TIMING: Timing = { botRoll: 600, botMove: 400, step: 120 }
export const FAST_TIMING: Timing = { botRoll: 0, botMove: 0, step: 0 }

export type GameOptions = {
  settings: Settings
  seats: Seats
  dice: Dice
  timing: Timing
  log?: GameEvent[]
  initial?: GameState
  random?: () => number
  onChange?: (game: GameState) => void
}

type Animation = { piece: PieceId; path: Position[]; step: number; next: GameState }

const samePiece = (a: PieceId, b: PieceId) => a.color === b.color && a.index === b.index

export function useGame({ settings, seats, dice, timing, log, initial, random = Math.random, onChange }: GameOptions) {
  const [game, setGame] = useState(() => initial ?? (log ? replay(settings, log) : createGame(settings)))
  const [animation, setAnimation] = useState<Animation>()
  const [selected, setSelected] = useState<PieceId>()
  const [lastRoll, setLastRoll] = useState<number>()
  const [message, setMessage] = useState<string>()

  const seatOf = (color: Color) => seats[color] ?? 'computer'
  const busy = animation !== undefined
  const mover = currentMover(game)
  const moves = busy ? [] : legalMoves(game)
  const humanToRoll = !busy && game.status === 'playing' && game.pendingRoll === undefined && seatOf(game.turn) === 'human'
  const humanToMove = !busy && mover !== undefined && seatOf(mover) === 'human'

  function roll() {
    const value = dice()
    const next = rollDice(game, value)
    setLastRoll(value)
    setMessage(next.pendingRoll === undefined ? 'No moves' : undefined)
    setGame(next)
  }

  function play(move: Move) {
    const next = applyMove(game, move)
    setSelected(undefined)
    setMessage(kickMessage(move))
    if (timing.step === 0) return setGame(next)
    setAnimation({ piece: move.piece, path: movePath(game, move), step: 0, next })
  }

  function select(piece: PieceId) {
    const own = moves.filter((m) => samePiece(m.piece, piece))
    if (own.length === 1) return play(own[0])
    setSelected(piece)
  }

  useEffect(() => {
    onChange?.(game)
  }, [game])

  // Step the animation; apply the move once the piece reaches the end of its path.
  useEffect(() => {
    if (!animation) return
    const id = setTimeout(() => {
      if (animation.step + 1 < animation.path.length) return setAnimation({ ...animation, step: animation.step + 1 })
      setAnimation(undefined)
      setGame(animation.next)
    }, timing.step)
    return () => clearTimeout(id)
  }, [animation])

  // Computer seats roll and move by themselves.
  useEffect(() => {
    if (busy || game.status !== 'playing') return
    if (game.pendingRoll === undefined) {
      if (seatOf(game.turn) !== 'computer') return
      const id = setTimeout(roll, timing.botRoll)
      return () => clearTimeout(id)
    }
    if (mover && seatOf(mover) === 'computer') {
      const id = setTimeout(() => play(chooseMove(game, random)!), timing.botMove)
      return () => clearTimeout(id)
    }
  }, [game, busy])

  const movable = humanToMove ? moves.map((m) => m.piece).filter((p, i, all) => all.findIndex((q) => samePiece(p, q)) === i) : []
  const targets = humanToMove && selected ? moves.filter((m) => samePiece(m.piece, selected)) : []
  const moving: Moving | undefined = animation && { piece: animation.piece, at: animation.path[animation.step] }

  return { game, moving, movable, selected, targets, lastRoll, message, humanToRoll, humanToMove, roll, select, play }
}
```

- [ ] **Step 7: Run the tests to see them pass**

Run: `cd packages/web && npx vitest run && npx tsc --noEmit`
Expected: all pass.

- [ ] **Step 8: Commit**

```bash
git add packages/web/src/dice.ts packages/web/src/types.ts packages/web/src/storage.ts packages/web/src/useGame.ts packages/web/src/dice.test.ts packages/web/src/storage.test.ts packages/web/src/useGame.test.ts
git commit -m "feat(web): dice, saving and the useGame hook with computer seats"
```

---

### Task 5: Screens and App flow

**Goal:**
- The Home, Setup, Game (board, turn banner, dice, message) and Results screens.
- An `App` that moves between them, saves after every change, and offers Continue.
- `main.tsx` reads `?seed=` and `?fast` for testing.

**Files:**
- Create: `packages/web/src/components/DiceButton.tsx`, `packages/web/src/screens/Home.tsx`, `packages/web/src/screens/Setup.tsx`, `packages/web/src/screens/GameScreen.tsx`, `packages/web/src/screens/Results.tsx`
- Modify (replace): `packages/web/src/App.tsx`, `packages/web/src/main.tsx`, `packages/web/src/App.test.tsx`
- Test: `packages/web/src/screens/Setup.test.tsx`, `packages/web/src/screens/Results.test.tsx`, `packages/web/src/App.test.tsx`

**Acceptance Criteria:**
- [ ] Setup builds the chosen settings and seats: mode, custom rules, after-kick, player count, seat types and end condition.
- [ ] Home → Setup → Start shows the game with the dice enabled for a human Red.
- [ ] An all-computer game reaches "Game over" with places listed.
- [ ] Quitting mid-game offers Continue, which resumes the same game.

**Verify:** `cd packages/web && npx vitest run && npx tsc --noEmit` → all pass.

**Steps:**

- [ ] **Step 1: Write the tests**

`src/screens/Setup.test.tsx`:
```tsx
import { MODES } from '@ludo/engine'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Setup } from './Setup'

describe('Setup', () => {
  it('defaults to Ghana, 4 players, Red human and the rest computer', async () => {
    const onStart = vi.fn()
    render(<Setup onStart={onStart} onBack={() => {}} />)
    await userEvent.click(screen.getByRole('button', { name: 'Start game' }))
    expect(onStart).toHaveBeenCalledWith(
      { players: 4, endCondition: 'firstWins', rules: MODES.ghana.rules, afterKick: 'normal' },
      { red: 'human', green: 'computer', yellow: 'computer', blue: 'computer' },
    )
  })

  it('builds the chosen settings', async () => {
    const user = userEvent.setup()
    const onStart = vi.fn()
    render(<Setup onStart={onStart} onBack={() => {}} />)
    await user.click(screen.getByLabelText('Classic'))
    await user.click(screen.getByText('Customise rules'))
    await user.click(screen.getByLabelText('Back Kick'))
    await user.selectOptions(screen.getByLabelText('After a kick'), 'endsTurn')
    await user.click(screen.getByLabelText('3 players'))
    await user.selectOptions(screen.getByLabelText('Green player'), 'human')
    await user.click(screen.getByLabelText('Play on for places'))
    await user.click(screen.getByRole('button', { name: 'Start game' }))
    expect(onStart).toHaveBeenCalledWith(
      {
        players: 3,
        endCondition: 'playForPlaces',
        rules: { ...MODES.classic.rules, backKick: true },
        afterKick: 'endsTurn',
      },
      { red: 'human', green: 'human', yellow: 'computer' },
    )
  })
})
```

`src/screens/Results.test.tsx`:
```tsx
import { createGame, settingsFor } from '@ludo/engine'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Results } from './Results'

describe('Results', () => {
  it('lists players by place', () => {
    const game = createGame(settingsFor('classic', 3, 'playForPlaces'))
    game.players[0].finishedPlace = 2
    game.players[1].finishedPlace = 1
    game.players[2].finishedPlace = 3
    render(<Results game={game} onPlayAgain={() => {}} onHome={() => {}} />)
    expect(screen.getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Green — 1st', 'Red — 2nd', 'Yellow — 3rd'])
  })
})
```

`src/App.test.tsx` (replace):
```tsx
import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from './App'
import { fixedDice, seededDice } from './dice'
import { FAST_TIMING } from './useGame'

describe('App', () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => vi.useRealTimers())

  it('goes from home through setup into a game', async () => {
    const user = userEvent.setup()
    render(<App dice={fixedDice([3])} timing={FAST_TIMING} />)
    expect(screen.getByRole('heading', { name: 'Ludo Unlimited' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'New game' }))
    await user.click(screen.getByRole('button', { name: 'Start game' }))
    expect(screen.getByRole('button', { name: /Roll dice/ })).toBeEnabled()
    expect(screen.getByText('Red to roll')).toBeInTheDocument()
  })

  it('offers Continue after quitting, and resumes the same game', async () => {
    const user = userEvent.setup()
    render(<App dice={fixedDice([6])} timing={FAST_TIMING} />)
    await user.click(screen.getByRole('button', { name: 'New game' }))
    await user.click(screen.getByRole('button', { name: 'Start game' }))
    await user.click(screen.getByRole('button', { name: /Roll dice/ }))
    await user.click(screen.getByRole('button', { name: 'Quit to menu' }))
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    expect(screen.getByText('Red to move')).toBeInTheDocument()
  })

  it('an all-computer game ends on the results screen', async () => {
    vi.useFakeTimers()
    render(<App dice={seededDice(5)} timing={FAST_TIMING} />)
    fireEvent.click(screen.getByRole('button', { name: 'New game' }))
    fireEvent.change(screen.getByLabelText('Red player'), { target: { value: 'computer' } })
    fireEvent.click(screen.getByRole('button', { name: 'Start game' }))
    for (let i = 0; i < 50_000; i++) {
      await act(async () => {
        vi.runOnlyPendingTimers()
      })
      if (i % 200 === 0 && screen.queryByText('Game over')) break
    }
    expect(screen.getByRole('heading', { name: 'Game over' })).toBeInTheDocument()
  }, 60_000)
})
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `cd packages/web && npx vitest run`
Expected: FAIL, because the screens don't exist and `App` doesn't take `dice`/`timing` yet.

- [ ] **Step 3: Write `src/components/DiceButton.tsx`**

```tsx
const PIPS: Record<number, number[]> = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
}

export function DiceButton({ value, disabled, onRoll }: { value?: number; disabled: boolean; onRoll: () => void }) {
  return (
    <button
      type="button"
      className="dice"
      disabled={disabled}
      onClick={onRoll}
      aria-label={value ? `Roll dice (last roll ${value})` : 'Roll dice'}
    >
      <span className="pips" aria-hidden="true">
        {Array.from({ length: 9 }, (_, i) => (
          <span key={i} className={value && PIPS[value].includes(i) ? 'pip on' : 'pip'} />
        ))}
      </span>
    </button>
  )
}
```

- [ ] **Step 4: Write `src/screens/Home.tsx`**

```tsx
export function Home({ canContinue, onNew, onContinue }: { canContinue: boolean; onNew: () => void; onContinue: () => void }) {
  return (
    <main className="screen home">
      <h1>Ludo Unlimited</h1>
      <p>Ludo with Ghanaian kicks: Back, Line and Home Kicks, the wicked move and Labourer.</p>
      <button type="button" className="primary" onClick={onNew}>
        New game
      </button>
      {canContinue && (
        <button type="button" className="secondary" onClick={onContinue}>
          Continue
        </button>
      )}
    </main>
  )
}
```

- [ ] **Step 5: Write `src/screens/Setup.tsx`**

```tsx
import { MODES, SEATS, settingsFor, type AfterKick, type EndCondition, type ModeName, type Rules, type Settings } from '@ludo/engine'
import { useState } from 'react'
import { COLOR_NAME } from '../labels'
import type { Seat, Seats } from '../types'

const MODE_NAME: Record<ModeName, string> = { classic: 'Classic', ghana: 'Ghana' }
const RULE_NAME: [keyof Rules, string][] = [
  ['backKick', 'Back Kick'],
  ['lineKick', 'Line Kick'],
  ['homeKick', 'Home Kick'],
  ['labourer', 'Labourer'],
]
const AFTER_KICK: [AfterKick, string][] = [
  ['normal', 'Nothing changes (a 6 still rolls again)'],
  ['endsTurn', 'A kick ends the turn'],
  ['bonusRoll', 'A kick earns another roll'],
]
const END: [EndCondition, string][] = [
  ['firstWins', 'First to finish wins'],
  ['playForPlaces', 'Play on for places'],
]

export function Setup({ onStart, onBack }: { onStart: (settings: Settings, seats: Seats) => void; onBack: () => void }) {
  const [mode, setMode] = useState<ModeName>('ghana')
  const [rules, setRules] = useState<Rules>({ ...MODES.ghana.rules })
  const [afterKick, setAfterKick] = useState<AfterKick>(MODES.ghana.afterKick)
  const [players, setPlayers] = useState<Settings['players']>(4)
  const [seats, setSeats] = useState<Seats>({ red: 'human' })
  const [endCondition, setEndCondition] = useState<EndCondition>('firstWins')

  function pickMode(next: ModeName) {
    setMode(next)
    setRules({ ...MODES[next].rules })
    setAfterKick(MODES[next].afterKick)
  }

  function start() {
    const chosen = Object.fromEntries(SEATS[players].map((color) => [color, seats[color] ?? 'computer'])) as Seats
    onStart({ ...settingsFor(mode, players, endCondition), rules, afterKick }, chosen)
  }

  return (
    <main className="screen setup">
      <h1>New game</h1>

      <fieldset>
        <legend>Mode</legend>
        {(Object.keys(MODE_NAME) as ModeName[]).map((name) => (
          <label key={name}>
            <input type="radio" name="mode" checked={mode === name} onChange={() => pickMode(name)} />
            {MODE_NAME[name]}
          </label>
        ))}
      </fieldset>

      <details>
        <summary>Customise rules</summary>
        {RULE_NAME.map(([key, name]) => (
          <label key={key}>
            <input type="checkbox" checked={rules[key]} onChange={(e) => setRules({ ...rules, [key]: e.target.checked })} />
            {name}
          </label>
        ))}
        <label htmlFor="after-kick">After a kick</label>
        <select id="after-kick" value={afterKick} onChange={(e) => setAfterKick(e.target.value as AfterKick)}>
            {AFTER_KICK.map(([value, name]) => (
              <option key={value} value={value}>
                {name}
              </option>
            ))}
        </select>
      </details>

      <fieldset>
        <legend>Players</legend>
        {([2, 3, 4] as const).map((n) => (
          <label key={n}>
            <input type="radio" name="players" checked={players === n} onChange={() => setPlayers(n)} />
            {n} players
          </label>
        ))}
      </fieldset>

      <fieldset>
        <legend>Seats</legend>
        {SEATS[players].map((color) => (
          <span key={color} className="seat">
            <label htmlFor={`seat-${color}`}>{COLOR_NAME[color]} player</label>
            <select
              id={`seat-${color}`}
              value={seats[color] ?? 'computer'}
              onChange={(e) => setSeats({ ...seats, [color]: e.target.value as Seat })}
            >
              <option value="human">Human</option>
              <option value="computer">Computer</option>
            </select>
          </span>
        ))}
      </fieldset>

      <fieldset>
        <legend>Winning</legend>
        {END.map(([value, name]) => (
          <label key={value}>
            <input type="radio" name="end" checked={endCondition === value} onChange={() => setEndCondition(value)} />
            {name}
          </label>
        ))}
      </fieldset>

      <div className="actions">
        <button type="button" className="secondary" onClick={onBack}>
          Back
        </button>
        <button type="button" className="primary" onClick={start}>
          Start game
        </button>
      </div>
    </main>
  )
}
```

- [ ] **Step 6: Write `src/screens/GameScreen.tsx`**

```tsx
import { currentMover, type GameState } from '@ludo/engine'
import { useEffect } from 'react'
import { Board } from '../components/Board'
import { DiceButton } from '../components/DiceButton'
import { COLOR_NAME } from '../labels'
import { COLOR_HEX, ON_COLOR } from '../theme'
import { useGame, type GameOptions } from '../useGame'

export function GameScreen({ options, onFinish, onQuit }: { options: GameOptions; onFinish: (game: GameState) => void; onQuit: () => void }) {
  const g = useGame(options)
  const { game } = g

  useEffect(() => {
    if (game.status === 'finished' && !g.moving) onFinish(game)
  }, [game, g.moving])

  const mover = currentMover(game) ?? game.turn
  const banner =
    mover !== game.turn
      ? `${COLOR_NAME[mover]} moves with ${COLOR_NAME[game.turn]}'s roll`
      : `${COLOR_NAME[game.turn]} to ${game.pendingRoll === undefined ? 'roll' : 'move'}`

  return (
    <main className="screen game">
      <Board
        state={game}
        moving={g.moving}
        movable={g.movable}
        selected={g.selected}
        targets={g.targets}
        onSelectPiece={g.select}
        onPickTarget={g.play}
      />
      <aside className="panel">
        <p className="banner" style={{ background: COLOR_HEX[mover], color: ON_COLOR[mover] }}>
          {banner}
        </p>
        <DiceButton value={g.lastRoll} disabled={!g.humanToRoll} onRoll={g.roll} />
        <p className="hint">{g.humanToRoll ? 'Tap the dice to roll' : g.humanToMove ? 'Tap a glowing piece' : ''}</p>
        <p className="message" role="status">
          {g.message ?? ''}
        </p>
        <button type="button" className="secondary" onClick={onQuit}>
          Quit to menu
        </button>
      </aside>
    </main>
  )
}
```

- [ ] **Step 7: Write `src/screens/Results.tsx`**

```tsx
import type { GameState } from '@ludo/engine'
import { COLOR_NAME } from '../labels'
import { COLOR_HEX } from '../theme'

const ORDINAL = ['1st', '2nd', '3rd', '4th']

export function Results({ game, onPlayAgain, onHome }: { game: GameState; onPlayAgain: () => void; onHome: () => void }) {
  const ranked = [...game.players].sort((a, b) => (a.finishedPlace ?? 99) - (b.finishedPlace ?? 99))
  return (
    <main className="screen results">
      <h1>Game over</h1>
      <ol>
        {ranked.map((p) => (
          <li key={p.color}>
            <span className="dot" style={{ background: COLOR_HEX[p.color] }} />
            {COLOR_NAME[p.color]}
            {p.finishedPlace ? ` — ${ORDINAL[p.finishedPlace - 1]}` : ''}
          </li>
        ))}
      </ol>
      <div className="actions">
        <button type="button" className="secondary" onClick={onHome}>
          Home
        </button>
        <button type="button" className="primary" onClick={onPlayAgain}>
          Play again
        </button>
      </div>
    </main>
  )
}
```

- [ ] **Step 8: Replace `src/App.tsx`**

```tsx
import type { GameEvent, GameState, Settings } from '@ludo/engine'
import { useState } from 'react'
import type { Dice } from './dice'
import { GameScreen } from './screens/GameScreen'
import { Home } from './screens/Home'
import { Results } from './screens/Results'
import { Setup } from './screens/Setup'
import { clearGame, loadGame, saveGame } from './storage'
import type { Seats } from './types'
import type { Timing } from './useGame'

type Screen =
  | { name: 'home' }
  | { name: 'setup' }
  | { name: 'game'; settings: Settings; seats: Seats; log?: GameEvent[]; key: number }
  | { name: 'results'; game: GameState; settings: Settings; seats: Seats }

export function App({ dice, timing }: { dice: Dice; timing: Timing }) {
  const [screen, setScreen] = useState<Screen>({ name: 'home' })
  const [saved, setSaved] = useState(loadGame)

  const startGame = (settings: Settings, seats: Seats, log?: GameEvent[]) =>
    setScreen({ name: 'game', settings, seats, log, key: Date.now() })
  const goHome = () => {
    setSaved(loadGame())
    setScreen({ name: 'home' })
  }

  switch (screen.name) {
    case 'home':
      return (
        <Home
          canContinue={saved !== undefined}
          onNew={() => setScreen({ name: 'setup' })}
          onContinue={() => startGame(saved!.settings, saved!.seats, saved!.log)}
        />
      )
    case 'setup':
      return <Setup onBack={goHome} onStart={(settings, seats) => startGame(settings, seats)} />
    case 'game':
      return (
        <GameScreen
          key={screen.key}
          options={{
            settings: screen.settings,
            seats: screen.seats,
            log: screen.log,
            dice,
            timing,
            onChange: (game) => saveGame({ settings: screen.settings, seats: screen.seats, log: game.log }),
          }}
          onQuit={goHome}
          onFinish={(game) => {
            clearGame()
            setSaved(undefined)
            setScreen({ name: 'results', game, settings: screen.settings, seats: screen.seats })
          }}
        />
      )
    case 'results':
      return <Results game={screen.game} onPlayAgain={() => startGame(screen.settings, screen.seats)} onHome={goHome} />
  }
}
```

- [ ] **Step 9: Replace `src/main.tsx`**

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { randomDice, seededDice } from './dice'
import './styles.css'
import { FAST_TIMING, NORMAL_TIMING } from './useGame'

// ?seed=N gives repeatable dice, and ?fast skips pauses and animation (used by the browser tests).
const params = new URLSearchParams(location.search)
const seed = params.get('seed')
const dice = seed ? seededDice(Number(seed)) : randomDice
const timing = params.has('fast') ? FAST_TIMING : NORMAL_TIMING

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App dice={dice} timing={timing} />
  </StrictMode>,
)
```

- [ ] **Step 10: Run the tests and the typecheck**

Run: `cd packages/web && npx vitest run && npx tsc --noEmit`
Expected: all pass.

- [ ] **Step 11: Check it in the browser**

Run `npm run dev -w @ludo/web` and open the URL it prints. Play a few turns: roll, tap a glowing piece, pick a target. Then quit and Continue. Fix anything broken before committing.

- [ ] **Step 12: Commit**

```bash
git add packages/web/src
git commit -m "feat(web): home, setup, game and results screens"
```

---

### Task 6: PWA

**Goal:** Ludo Unlimited can be installed and works offline: a web manifest, generated icons and a service worker.

**Files:**
- Create: `packages/web/public/icon.svg`, the generated PNG icons in `packages/web/public/`
- Modify: `packages/web/vite.config.ts`, `packages/web/index.html`

**Acceptance Criteria:**
- [ ] `npm run build -w @ludo/web` produces `dist/manifest.webmanifest` and `dist/sw.js`.
- [ ] The manifest is named "Ludo Unlimited", is standalone, and has 192 px and 512 px icons.

**Verify:** `npm run build -w @ludo/web && ls packages/web/dist/manifest.webmanifest packages/web/dist/sw.js` → both files are listed.

**Steps:**

- [ ] **Step 1: Install** (from the repo root)

```bash
npm install -D -w @ludo/web vite-plugin-pwa @vite-pwa/assets-generator
```

- [ ] **Step 2: Write `packages/web/public/icon.svg`**

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="112" fill="#ffffff"/>
  <polygon points="96,96 416,96 256,256" fill="#30a46c"/>
  <polygon points="416,96 416,416 256,256" fill="#f5b301"/>
  <polygon points="96,416 416,416 256,256" fill="#3e63dd"/>
  <polygon points="96,96 96,416 256,256" fill="#e5484d"/>
</svg>
```

- [ ] **Step 3: Generate the PNG icons** (from `packages/web`)

Run: `npx pwa-assets-generator --preset minimal-2023 public/icon.svg`
Expected: `public/pwa-64x64.png`, `pwa-192x192.png`, `pwa-512x512.png`, `maskable-icon-512x512.png`, `apple-touch-icon-180x180.png` and `favicon.ico`.

- [ ] **Step 4: Replace `packages/web/vite.config.ts`**

```ts
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon-180x180.png', 'icon.svg'],
      manifest: {
        name: 'Ludo Unlimited',
        short_name: 'Ludo Unlimited',
        description: 'Ludo with Ghanaian kicks',
        theme_color: '#3e63dd',
        background_color: '#eef2f7',
        display: 'standalone',
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
})
```

- [ ] **Step 5: Add the icons to `packages/web/index.html`**

After the `theme-color` meta, add:
```html
    <link rel="icon" href="/favicon.ico" sizes="48x48" />
    <link rel="icon" href="/icon.svg" type="image/svg+xml" />
    <link rel="apple-touch-icon" href="/apple-touch-icon-180x180.png" />
```

- [ ] **Step 6: Build and verify**

Run (repo root): `npm run build -w @ludo/web && ls packages/web/dist/manifest.webmanifest packages/web/dist/sw.js && npm test`
Expected: both files exist, and the tests still pass.

- [ ] **Step 7: Commit**

```bash
git add packages/web/public packages/web/vite.config.ts packages/web/index.html packages/web/package.json package-lock.json
git commit -m "feat(web): installable PWA with icons and offline support"
```

Add `packages/web/dist/` to the root `.gitignore` in the same commit:
```
node_modules/
packages/web/dist/
```

---

### Task 7: Browser test (Playwright)

**Goal:** A real-browser test where four computer players play a full game, with fixed dice and no pauses, to the results screen, at phone and desktop sizes.

**Files:**
- Create: `packages/web/playwright.config.ts`, `packages/web/e2e/full-game.spec.ts`
- Modify: `packages/web/tsconfig.json` (include `e2e` and `playwright.config.ts`), `.gitignore`

**Acceptance Criteria:**
- [ ] `npm run e2e -w @ludo/web` passes for both the `phone` and `desktop` projects.

**Verify:** `npm run e2e -w @ludo/web` → 2 passed.

**Steps:**

- [ ] **Step 1: Install** (from the repo root)

```bash
npm install -D -w @ludo/web @playwright/test
npx -w @ludo/web playwright install chromium
```

- [ ] **Step 2: Write `packages/web/playwright.config.ts`**

```ts
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: 'e2e',
  timeout: 120_000,
  use: { baseURL: 'http://localhost:5199' },
  projects: [
    { name: 'phone', use: { ...devices['Pixel 7'] } },
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: 'npm run dev -- --port 5199 --strictPort',
    url: 'http://localhost:5199',
    reuseExistingServer: true,
  },
})
```

- [ ] **Step 3: Write `packages/web/e2e/full-game.spec.ts`**

```ts
import { expect, test } from '@playwright/test'

test('four computers play a game to the end', async ({ page }) => {
  await page.goto('/?seed=7&fast')
  await page.getByRole('button', { name: 'New game' }).click()
  await page.getByLabel('Red player').selectOption('computer')
  await page.getByRole('button', { name: 'Start game' }).click()
  await expect(page.getByRole('heading', { name: 'Game over' })).toBeVisible({ timeout: 100_000 })
  await expect(page.getByRole('listitem')).toHaveCount(4)
})

test('the board fits the screen without sideways scrolling', async ({ page }) => {
  await page.goto('/?seed=7')
  await page.getByRole('button', { name: 'New game' }).click()
  await page.getByRole('button', { name: 'Start game' }).click()
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow).toBe(0)
})
```

- [ ] **Step 4: Update `packages/web/tsconfig.json` and `.gitignore`**

In `tsconfig.json`, change `include` to:
```json
  "include": ["src", "e2e", "vite.config.ts", "playwright.config.ts"]
```

Append to the root `.gitignore`:
```
packages/web/test-results/
packages/web/playwright-report/
```

- [ ] **Step 5: Run it**

Run: `npm run e2e -w @ludo/web`
Expected: 4 passed (2 tests × 2 projects). If the full game times out, check that `?fast` reaches `FAST_TIMING` in `main.tsx`.

- [ ] **Step 6: Commit**

```bash
git add packages/web/playwright.config.ts packages/web/e2e packages/web/tsconfig.json packages/web/package.json package-lock.json .gitignore
git commit -m "test(web): browser test of a full computer game at phone and desktop sizes"
```

---

### Task 8: The user plays it

**Goal:** The user plays a real game in their browser and confirms that Round 1 works and feels right.

**Files:** none (feedback only, which may lead to follow-up fixes)

**Acceptance Criteria:**
- [ ] The user has played at least a few turns, against computers or in pass and play.
- [ ] The user confirms it works, or lists what to change.

**Verify:** The user's answer.

**Steps:**

- [ ] **Step 1:** Start `npm run dev -w @ludo/web -- --host` in the background, and give the user the local URL and the network URL (for trying it on a phone on the same Wi-Fi).

- [ ] **Step 2:** Ask the user.

**User Verification Required:**
Before marking this task complete, you MUST call AskUserQuestion:
```yaml
AskUserQuestion:
  question: "Ludo Unlimited is running at the URL above. Play a few turns (try a kick). Does Round 1 work and feel right?"
  header: "Verification"
  options:
    - label: "Works, move on"
      description: "Round 1 is accepted; next up is Round 2 (effects)"
    - label: "Needs changes"
      description: "Tell me what's off and I'll fix it before moving on"
```

If the user picks "Needs changes", fix what they list, run the tests again, and ask again.
