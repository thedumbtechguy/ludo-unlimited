# Online Rooms Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers-extended-cc:subagent-driven-development (recommended) or superpowers-extended-cc:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Friends play Ludo Unlimited together on their own devices, in private rooms joined by a code or link. The server runs the game and the dice.

**Architecture:**
- **One Durable Object per room.** Each room runs a pure reducer (`packages/server/src/room.ts`) over the existing rules engine, and owns the dice, timers and computer players.
- **One Worker.** It serves the built app and `/api/*`.
- **Devices.** They send what the player wants to do (roll, move, stop) and replay the room's events through the engine. That way the existing animations, effects and sounds work unchanged.
- **Web refactor.** `useGame` is split into a view part (applying and animating events) and a source part (local dice and computer players), so the online hook can reuse the view part.

**Tech Stack:**
- TypeScript, React 18, Vite 8, Vitest 4.
- Cloudflare Workers with Durable Objects (WebSocket hibernation, alarms, the KV storage API) and the Rate Limiting binding.
- `@cloudflare/vitest-plugin`, Playwright.

**User Verification:** YES. Before this is called done, the user plays a real room across two devices on the local dev server (Task 12).

**Spec:** `docs/superpowers/specs/2026-11-08-online-rooms-design.md`. Small refinements made while planning:
1. **Turn clock:** messages carry `deadlineIn` (milliseconds left), not a server timestamp, so device clocks that disagree don't matter.
2. **Fewer message types:** lobby changes and member changes are sent as a full personalised `room` message, instead of separate `members` and `lobby` messages. `clock` carries the deadline, pause and covering after each game event.
3. **New messages:** `{ t: 'rejoin', color }` is added for "Rejoin as …", and `pause` takes an optional `for` colour, the player being waited for.
4. **Rate limit:** Cloudflare's rate-limit binding only supports 10- or 60-second windows, so room creation is limited to 3 per minute per IP instead of 10 per hour.
5. **Away players:** a disconnected player's yard name reads "Kofi (away)", instead of using a greyed dot.

**House rules for every task:**
- Run commands from the repo root `/Users/stefan/Documents/radioactive_labs/ludo` unless a step says otherwise.
- Use Node 22: `export PATH=$HOME/.nvm/versions/node/v22.23.3/bin:$PATH`. Wrangler needs it.
- Commit after each task. **Never push.** The user said no pushing until they say so.
- No Claude attribution in commit messages.
- Comments are short and plain. No defensive checks for things that can't happen.

---

## File map

**Engine (`packages/engine/src`):**
- `pace.ts` (new): `ANIMATION_TIMING`, `WICKED_DELAY`, `eventMs()`. How long devices take to show an event.
- `protocol.ts` (new): all message types, `PROTOCOL_VERSION`, `TurnTimer`, `TIMER_SECONDS`, `REACTIONS`.
- `index.ts`: export both, plus `outcomeKey`.

**Server (`packages/server`, new package):**
- `package.json`, `tsconfig.json`, `vitest.config.ts`, `wrangler.jsonc`. This config replaces `packages/web/wrangler.jsonc`.
- `src/validate.ts`: `cleanName`, `validSettings`, `validTimer`, `makeCode`, `CODE_ALPHABET`.
- `src/room.ts`: the pure room reducer (`createRoom`, `reduce`, `viewOf`).
- `src/RoomObject.ts`: the Durable Object shell (storage, sockets, alarm).
- `src/index.ts`: the Worker entry and `/api` routes.
- `test/validate.test.ts`, `test/lobby.test.ts`, `test/play.test.ts`, `test/api.test.ts`.

**Web (`packages/web/src`):**
- `useGameView.ts` (new): game state, the event queue, animation, effects and callouts.
- `useGame.ts`: the local source (dice and computer players) on top of `useGameView`.
- `screens/GameView.tsx` (new): the old `GameScreen` body, driven by a controller `g` and props.
- `screens/GameScreen.tsx`: becomes a thin local wrapper (`useGame` and `GameView`), with the same props as now.
- `online/socket.ts` (new): a reconnecting WebSocket.
- `online/useOnlineGame.ts` (new): the online controller.
- `online/api.ts` (new): `createRoom`, `roomInfo`, `socketUrl`.
- `online/PlayOnline.tsx`, `online/Lobby.tsx`, `online/RoomScreen.tsx`, `online/OnlineResults.tsx`, `online/TurnClock.tsx`, `online/Reactions.tsx` (new).
- `screens/Setup.tsx`: an online mode (no seat rows, a Turn timer row, a Create room button).
- `storage.ts`: `loadDevice`, `loadName`, `saveName`.
- `App.tsx`: online screens, and `/r/CODE` links.
- `components/Board.tsx`: an `away` prop.
- `vite.config.ts`: proxy `/api` (with WebSockets) to `wrangler dev`.
- `e2e/online.spec.ts` (new), plus `playwright.config.ts` starting `wrangler dev` too.

**Other:**
- Root `package.json`: the `deploy` script uses the server package.
- `.github/workflows/test.yml`: e2e now also starts wrangler. No change is needed if the Playwright config starts it.
- `README` and the spec: a note on the new Workers Builds deploy command.

---

### Task 1: Engine: pacing and protocol types

**Goal:** One shared place for how long devices take to show each event, and the message types both sides compile against.

**Files:**
- Create: `packages/engine/src/pace.ts`, `packages/engine/src/protocol.ts`, `packages/engine/test/pace.test.ts`
- Modify: `packages/engine/src/index.ts`

**Acceptance Criteria:**
- [ ] `eventMs(before, event)` returns the roll time for a roll, step × path length + `LAND_MS` for a move (+ `WICKED_DELAY` when wicked), and 0 for stop or pass.
- [ ] Every protocol type in this task compiles and is exported from `@ludo/engine`.
- [ ] Engine tests pass.

**Verify:** `npm test -w @ludo/engine` → all pass, including the new `pace.test.ts`.

**Steps:**

- [ ] **Step 1: Write the failing test** `packages/engine/test/pace.test.ts`

```ts
import { describe, expect, it } from 'vitest'
import { ANIMATION_TIMING, eventMs, LAND_MS, WICKED_DELAY } from '../src/pace'
import { lane, track } from '../src/position'
import { piece, setup } from './helpers'

describe('eventMs', () => {
  it('a roll takes the dice animation', () => {
    expect(eventMs(setup(), { type: 'roll', value: 3 })).toBe(ANIMATION_TIMING.roll)
  })

  it('a move takes a step per square, then the landing', () => {
    const s = setup({ roll: 3, pieces: { red: [5] } })
    expect(eventMs(s, { type: 'move', move: { kind: 'forward', piece: piece('red'), to: track(8) } })).toBe(3 * ANIMATION_TIMING.step + LAND_MS)
  })

  it('a wicked kick waits for "Wicked!" on top', () => {
    const s = setup({ rules: { backKick: true }, roll: 5, pieces: { red: [lane('red', 4)], yellow: [0] } })
    const move = { kind: 'back' as const, piece: piece('red'), to: track(0), kick: piece('yellow') }
    expect(eventMs(s, { type: 'move', move })).toBe(5 * ANIMATION_TIMING.step + LAND_MS + WICKED_DELAY)
  })

  it('stopping and passing are instant', () => {
    expect(eventMs(setup(), { type: 'stop' })).toBe(0)
    expect(eventMs(setup(), { type: 'pass' })).toBe(0)
  })
})
```

> Before relying on the wicked fixture, check it with `isWicked` in a scratch test. A back move of 5 from red's lane square 4 should reach track 0 (red's start is track 0, so lane 4 → lane 0 … → track 50 …). If it doesn't land there, use the wicked fixture from `packages/engine/test/wicked.test.ts` instead.

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run test/pace.test.ts` in `packages/engine`. Expected: FAIL, `Cannot find module '../src/pace'`.

- [ ] **Step 3: Write `packages/engine/src/pace.ts`**

```ts
import { isWicked } from './effects'
import { movePath } from './movePath'
import type { GameEvent, GameState } from './types'

/** The pace devices show the game at. The room waits on it, so every screen keeps up. */
export type Timing = { botRoll: number; botMove: number; step: number; roll: number }
export const ANIMATION_TIMING: Timing = { botRoll: 600, botMove: 400, step: 120, roll: 650 }

/** After a piece's last step: the landing, its effects and callout. */
export const LAND_MS = 400
/** How long after a wicked kick lands "Wicked!" comes in on top of it. */
export const WICKED_DELAY = 350

/** How long devices take to show `event`, played on `before`. */
export function eventMs(before: GameState, event: GameEvent, timing: Timing = ANIMATION_TIMING): number {
  switch (event.type) {
    case 'roll':
      return timing.roll
    case 'move':
      return movePath(before, event.move).length * timing.step + LAND_MS + (isWicked(before, event.move) ? WICKED_DELAY : 0)
    case 'stop':
    case 'pass':
      return 0
  }
}
```

- [ ] **Step 4: Write `packages/engine/src/protocol.ts`**

```ts
import type { Color, GameEvent, Move, Settings } from './types'

/** Bumped whenever messages change shape; a device on another version is asked to update. */
export const PROTOCOL_VERSION = 1

export type TurnTimer = 'relaxed' | 'normal' | 'quick' | 'off'
export const TIMER_SECONDS: Record<Exclude<TurnTimer, 'off'>, number> = { relaxed: 60, normal: 30, quick: 15 }

export const REACTIONS = ['laugh', 'clap', 'shock', 'fire', 'hurry', 'wicked'] as const
export type Reaction = (typeof REACTIONS)[number]

export type MemberView = { id: number; name: string; connected: boolean; seat?: Color }

/** The room as every device sees it. No device IDs. */
export type RoomView = {
  code: string
  phase: 'lobby' | 'playing' | 'finished'
  host: number // member id
  settings: Settings
  timer: TurnTimer
  members: MemberView[]
  computers: Color[]
  covering: Color[]
  paused: boolean
  pausedFor?: Color
  log: GameEvent[]
  seq: number
  /** Milliseconds left for the current decision, when a human has the clock. */
  deadlineIn?: number
}

export type YouView = { id: number; seat?: Color; host: boolean }

/** What the join screen learns about a room before connecting. */
export type RoomInfo = { phase: RoomView['phase']; players: number; seatsFree: number }

export type ClientMessage =
  | { t: 'sit'; color: Color }
  | { t: 'stand' }
  | { t: 'rejoin'; color: Color }
  | { t: 'settings'; settings: Settings; timer: TurnTimer }
  | { t: 'start'; empty: 'computers' | 'drop' }
  | { t: 'roll' }
  | { t: 'move'; move: Move }
  | { t: 'stop' }
  | { t: 'pause'; for?: Color }
  | { t: 'resume' }
  | { t: 'react'; id: Reaction }
  | { t: 'rematch' }
  | { t: 'rename'; name: string }
  | { t: 'sync' }

export type ErrorCode = 'not_found' | 'old_version' | 'not_your_turn' | 'illegal' | 'too_fast' | 'replaced'

export type ServerMessage =
  | { t: 'room'; room: RoomView; you: YouView }
  | { t: 'event'; seq: number; event: GameEvent; by: 'human' | 'computer' }
  | { t: 'clock'; deadlineIn?: number; paused: boolean; pausedFor?: Color; covering: Color[] }
  | { t: 'reaction'; color: Color; id: Reaction }
  | { t: 'error'; code: ErrorCode }
```

- [ ] **Step 5: Export them.** In `packages/engine/src/index.ts`, change the `legalMoves` line and add two lines:

```ts
export { legalMoves, currentMover, outcomeKey } from './legalMoves'
export { ANIMATION_TIMING, LAND_MS, WICKED_DELAY, eventMs, type Timing } from './pace'
export * from './protocol'
```

- [ ] **Step 6: Run the engine tests and typecheck**

Run: `npm test -w @ludo/engine && npm run typecheck -w @ludo/engine`. Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add packages/engine
git commit -m "feat(engine): shared animation pacing and the online protocol types"
```

```json:metadata
{"files": ["packages/engine/src/pace.ts", "packages/engine/src/protocol.ts", "packages/engine/src/index.ts", "packages/engine/test/pace.test.ts"], "verifyCommand": "npm test -w @ludo/engine", "acceptanceCriteria": ["eventMs matches roll/move/wicked/stop rules", "protocol types exported from @ludo/engine", "engine tests pass"], "requiresUserVerification": false}
```

---

### Task 2: Web: pacing comes from the engine

**Goal:** The app animates with the engine's timing numbers, so the room and devices agree.

**Files:**
- Modify: `packages/web/src/useGame.ts` (lines 32–34 and the `WICKED_DELAY` constant)

**Acceptance Criteria:**
- [ ] `NORMAL_TIMING` is `ANIMATION_TIMING`, `Timing` is the engine type, and `WICKED_DELAY` is re-exported from the engine.
- [ ] Web tests and typecheck pass unchanged.

**Verify:** `npm test -w @ludo/web && npm run typecheck -w @ludo/web` → all pass.

**Steps:**

- [ ] **Step 1:** In `packages/web/src/useGame.ts`, replace

```ts
export type Timing = { botRoll: number; botMove: number; step: number; roll: number }
export const NORMAL_TIMING: Timing = { botRoll: 600, botMove: 400, step: 120, roll: 650 }
export const FAST_TIMING: Timing = { botRoll: 0, botMove: 0, step: 0, roll: 0 }
```

with

```ts
export type { Timing } from '@ludo/engine'
export const NORMAL_TIMING: Timing = ANIMATION_TIMING
export const FAST_TIMING: Timing = { botRoll: 0, botMove: 0, step: 0, roll: 0 }
```

Then add `ANIMATION_TIMING`, `WICKED_DELAY` and `type Timing` to the `@ludo/engine` import. Delete the local `export const WICKED_DELAY = 350` and its comment, and add `export { WICKED_DELAY }` so the tests' import still works.

- [ ] **Step 2: Verify:** run `npm test -w @ludo/web && npm run typecheck -w @ludo/web`. Expected: all pass.

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/useGame.ts
git commit -m "refactor(web): animation timing comes from the engine"
```

```json:metadata
{"files": ["packages/web/src/useGame.ts"], "verifyCommand": "npm test -w @ludo/web", "acceptanceCriteria": ["NORMAL_TIMING is ANIMATION_TIMING", "web tests pass"], "requiresUserVerification": false}
```

---
### Task 3: Server package: scaffold and validation

**Goal:** A `packages/server` workspace that tests run in, with input validation and room codes.

**Files:**
- Create: `packages/server/package.json`, `packages/server/tsconfig.json`, `packages/server/vitest.config.ts`, `packages/server/src/validate.ts`, `packages/server/test/validate.test.ts`
- Modify: root `package.json` (the `deploy` script), `packages/web/package.json` (move `wrangler` out of the web devDependencies)

**Acceptance Criteria:**
- [ ] `npm test -w @ludo/server` runs Vitest inside the Workers runtime through `@cloudflare/vitest-plugin`.
- [ ] `cleanName` trims, collapses spaces and caps names at 16 characters. It returns `undefined` for an empty name.
- [ ] `validSettings` accepts real engine `Settings` and rejects anything else. `validTimer` accepts the four timers.
- [ ] `makeCode(random)` gives 4 letters from `CODE_ALPHABET`, which has no I, L or O.

**Verify:** `npm test -w @ludo/server` → validate tests pass.

**Steps:**

- [ ] **Step 1: Create `packages/server/package.json`**

```json
{
  "name": "@ludo/server",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "wrangler dev",
    "test": "vitest run",
    "typecheck": "tsc --noEmit",
    "deploy": "npm run build -w @ludo/web && wrangler deploy"
  },
  "dependencies": {
    "@ludo/engine": "*"
  },
  "devDependencies": {
    "@cloudflare/vitest-plugin": "^1.6.0",
    "@cloudflare/workers-types": "^5.20261108.1",
    "typescript": "^7.0.2",
    "vitest": "^4.1.12",
    "wrangler": "^4.158.0"
  }
}
```

Remove `"wrangler"` from `packages/web/package.json` devDependencies, and its `"deploy"` script. In the root `package.json`, set `"deploy": "npm run deploy -w @ludo/server"`. Then run `npm install`.

- [ ] **Step 2: Create `packages/server/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "lib": ["ES2022"],
    "types": ["@cloudflare/workers-types", "@cloudflare/vitest-plugin/types"]
  },
  "include": ["src", "test"]
}
```

- [ ] **Step 3: Create `packages/server/vitest.config.ts`.** The `wrangler.jsonc` it points at comes in Task 6. Until then, use the inline Miniflare option so the tests can run.

```ts
import { cloudflareTest } from '@cloudflare/vitest-plugin'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [cloudflareTest({ miniflare: { compatibilityDate: '2026-11-01' } })],
  test: { include: ['test/**/*.test.ts'] },
})
```

> Check the option names against the current README of `@cloudflare/vitest-plugin` (it replaced `@cloudflare/vitest-pool-workers`). The docs show `cloudflareTest({ wrangler: { configPath } })` and a `miniflare` key for extra options.

- [ ] **Step 4: Write the failing test** `packages/server/test/validate.test.ts`

```ts
import { settingsFor } from '@ludo/engine'
import { describe, expect, it } from 'vitest'
import { CODE_ALPHABET, cleanName, makeCode, validSettings, validTimer } from '../src/validate'

describe('cleanName', () => {
  it('trims, collapses spaces and keeps 16 characters', () => {
    expect(cleanName('  Kofi   Mensah ')).toBe('Kofi Mensah')
    expect(cleanName('A'.repeat(30))).toBe('A'.repeat(16))
  })
  it('refuses an empty name', () => {
    expect(cleanName('   ')).toBeUndefined()
    expect(cleanName(42)).toBeUndefined()
  })
})

describe('validSettings', () => {
  it('accepts engine settings', () => {
    expect(validSettings(settingsFor('ghana', 4, 'firstWins'))).toBe(true)
    expect(validSettings(settingsFor('classic', 2, 'playForPlaces'))).toBe(true)
  })
  it('rejects anything else', () => {
    expect(validSettings({ ...settingsFor('ghana', 4, 'firstWins'), players: 5 })).toBe(false)
    expect(validSettings({ ...settingsFor('ghana', 4, 'firstWins'), afterKick: 'explode' })).toBe(false)
    expect(validSettings({ ...settingsFor('ghana', 4, 'firstWins'), rules: { backKick: 'yes' } })).toBe(false)
    expect(validSettings(null)).toBe(false)
  })
})

describe('validTimer', () => {
  it('knows the four timers', () => {
    for (const t of ['relaxed', 'normal', 'quick', 'off']) expect(validTimer(t)).toBe(true)
    expect(validTimer('slow')).toBe(false)
  })
})

describe('makeCode', () => {
  it('makes 4 letters with no look-alikes', () => {
    expect(CODE_ALPHABET).not.toMatch(/[ILO01]/)
    const values = [0, 0.5, 0.99, 0.25]
    let i = 0
    const code = makeCode(() => values[i++])
    expect(code).toMatch(new RegExp(`^[${CODE_ALPHABET}]{4}$`))
  })
})
```

- [ ] **Step 5: Run it to see it fail:** `npm test -w @ludo/server`. Expected: FAIL, the module isn't found.

- [ ] **Step 6: Write `packages/server/src/validate.ts`**

```ts
import type { Settings, TurnTimer } from '@ludo/engine'

/** Room code letters: no I, L or O, so a code read out loud or off a screen can't be mistaken. */
export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ'

export const makeCode = (random: () => number): string =>
  Array.from({ length: 4 }, () => CODE_ALPHABET[Math.floor(random() * CODE_ALPHABET.length)]).join('')

/** A nickname: trimmed, single-spaced, at most 16 characters. */
export function cleanName(name: unknown): string | undefined {
  if (typeof name !== 'string') return undefined
  const clean = name.trim().replace(/\s+/g, ' ').slice(0, 16)
  return clean || undefined
}

const RULE_KEYS = ['backKick', 'lineKick', 'homeKick', 'labourer'] as const

export function validSettings(value: unknown): value is Settings {
  if (typeof value !== 'object' || value === null) return false
  const s = value as Record<string, unknown>
  const rules = s.rules as Record<string, unknown> | undefined
  return (
    [2, 3, 4].includes(s.players as number) &&
    ['firstWins', 'playForPlaces'].includes(s.endCondition as string) &&
    ['endsTurn', 'normal', 'bonusRoll'].includes(s.afterKick as string) &&
    typeof rules === 'object' &&
    rules !== null &&
    RULE_KEYS.every((key) => typeof rules[key] === 'boolean')
  )
}

export const validTimer = (value: unknown): value is TurnTimer => ['relaxed', 'normal', 'quick', 'off'].includes(value as string)
```

- [ ] **Step 7: Run it to see it pass:** `npm test -w @ludo/server && npm run typecheck -w @ludo/server`. Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json packages/server packages/web/package.json
git commit -m "feat(server): new server package with input validation and room codes"
```

```json:metadata
{"files": ["packages/server/package.json", "packages/server/tsconfig.json", "packages/server/vitest.config.ts", "packages/server/src/validate.ts", "packages/server/test/validate.test.ts", "package.json", "packages/web/package.json"], "verifyCommand": "npm test -w @ludo/server", "acceptanceCriteria": ["vitest runs in the Workers runtime", "cleanName/validSettings/validTimer/makeCode behave as tested"], "requiresUserVerification": false}
```

---

### Task 4: Room reducer: lobby

**Goal:** The pure room logic for everything before the game: joining, watching, seats, host, settings, start, rejoin, rename, sync. A `schedule` hook is ready for Task 5.

**Files:**
- Create: `packages/server/src/room.ts`, `packages/server/test/helpers.ts`, `packages/server/test/lobby.test.ts`

**Acceptance Criteria:**
- [ ] `createRoom` makes a lobby with the creator as host. The creator is a disconnected member until their socket connects.
- [ ] Connecting adds a watcher, or reconnects a known device. Every connected device gets a personalised `room` message after any change.
- [ ] `sit` and `stand` work only in the lobby, on free seats of the host's player count.
- [ ] Only the host can change settings. Lowering the player count stands anyone on a seat that's gone.
- [ ] Start with `computers` fills the empty seats, and needs 1+ seated. `drop` needs 2+ seated, sets the player count and remaps colours to `SEATS[n]`, keeping colours where possible.
- [ ] The host role passes on when the host disconnects: first to the next connected seated member in colour order, then to any connected member.
- [ ] In the lobby, a disconnect frees the seat.
- [ ] Refused messages send `error` plus the full `room` to the sender only.

**Verify:** `npm test -w @ludo/server` → lobby tests pass.

**Steps:**

- [ ] **Step 1: Write `packages/server/test/helpers.ts`**

```ts
import { settingsFor, type ClientMessage, type ServerMessage } from '@ludo/engine'
import { createRoom, reduce, type Input, type Room, type Step } from '../src/room'

export const T0 = 1_000_000

/** Dice and tie-breaks from a fixed list, cycling. */
export const fixedRandom = (values: number[]) => {
  let i = 0
  return () => values[i++ % values.length]
}
/** A random value that rolls `n` on a die. */
export const die = (n: number) => (n - 1) / 6 + 0.01

export function lobby(players: 2 | 3 | 4 = 4): Room {
  return createRoom({ code: 'KQZM', device: 'host', name: 'Ama', settings: settingsFor('ghana', players, 'firstWins'), timer: 'normal', now: T0 })
}

/** Run inputs in order; returns the last step. */
export function run(room: Room, inputs: Input[], now = T0, random = fixedRandom([0.5])): Step {
  let step: Step = { room, sends: [], alarm: 0, remove: false }
  for (const input of inputs) step = reduce(step.room, input, now, random)
  return step
}

export const join = (device: string, name = device): Input => ({ type: 'connect', device, name })
export const say = (device: string, msg: ClientMessage): Input => ({ type: 'message', device, msg })

/** What one device was sent in a step. */
export const sentTo = (step: Step, device: string): ServerMessage[] =>
  step.sends.filter((s) => s.to === device || s.to === 'all').map((s) => s.msg)

export const seatOf = (room: Room, device: string) => room.members.find((m) => m.device === device)?.seat
```

- [ ] **Step 2: Write the failing tests** `packages/server/test/lobby.test.ts`

```ts
import { describe, expect, it } from 'vitest'
import { viewOf } from '../src/room'
import { join, lobby, run, say, seatOf, sentTo } from './helpers'

describe('lobby', () => {
  it('the creator is the host; joining makes a watcher and tells everyone', () => {
    const step = run(lobby(), [join('host', 'Ama'), join('kofi', 'Kofi')])
    expect(step.room.host).toBe('host')
    expect(step.room.members.map((m) => [m.name, m.connected, m.seat])).toEqual([
      ['Ama', true, undefined],
      ['Kofi', true, undefined],
    ])
    const toHost = sentTo(step, 'host').find((m) => m.t === 'room')
    expect(toHost).toMatchObject({ t: 'room', you: { host: true }, room: { phase: 'lobby' } })
    expect(sentTo(step, 'kofi').find((m) => m.t === 'room')).toMatchObject({ you: { host: false } })
  })

  it('the room view never carries device IDs', () => {
    const { room } = run(lobby(), [join('host')])
    expect(JSON.stringify(viewOf(room, room.lastActive))).not.toContain('"device"')
  })

  it('sits on a free seat of the player count, and stands', () => {
    let step = run(lobby(2), [join('host'), join('kofi'), say('host', { t: 'sit', color: 'red' })])
    expect(seatOf(step.room, 'host')).toBe('red')
    step = run(step.room, [say('kofi', { t: 'sit', color: 'red' })])
    expect(sentTo(step, 'kofi')[0]).toEqual({ t: 'error', code: 'illegal' })
    step = run(step.room, [say('kofi', { t: 'sit', color: 'green' })]) // green is not a 2-player seat
    expect(seatOf(step.room, 'kofi')).toBeUndefined()
    step = run(step.room, [say('kofi', { t: 'sit', color: 'yellow' }), say('host', { t: 'stand' })])
    expect([seatOf(step.room, 'host'), seatOf(step.room, 'kofi')]).toEqual([undefined, 'yellow'])
  })

  it('only the host changes settings; fewer players stands anyone on a seat that is gone', () => {
    let step = run(lobby(4), [join('host'), join('kofi'), say('kofi', { t: 'sit', color: 'blue' })])
    const two = { ...step.room.settings, players: 2 as const }
    step = run(step.room, [say('kofi', { t: 'settings', settings: two, timer: 'quick' })])
    expect(step.room.settings.players).toBe(4)
    step = run(step.room, [say('host', { t: 'settings', settings: two, timer: 'quick' })])
    expect(step.room.settings.players).toBe(2)
    expect(step.room.timer).toBe('quick')
    expect(seatOf(step.room, 'kofi')).toBeUndefined()
  })

  it('a disconnect in the lobby frees the seat; the host role passes on', () => {
    const step = run(lobby(), [
      join('host'),
      join('kofi'),
      join('esi'),
      say('host', { t: 'sit', color: 'red' }),
      say('esi', { t: 'sit', color: 'blue' }),
      { type: 'disconnect', device: 'host' },
    ])
    expect(seatOf(step.room, 'host')).toBeUndefined()
    expect(step.room.host).toBe('esi') // seated before watchers
  })

  it('start with computers fills the empty seats', () => {
    const step = run(lobby(4), [join('host'), say('host', { t: 'sit', color: 'green' }), say('host', { t: 'start', empty: 'computers' })])
    expect(step.room.phase).toBe('playing')
    expect(step.room.computers).toEqual(['red', 'yellow', 'blue'])
  })

  it('start with drop plays with who is there, on the seats of the smaller count', () => {
    const step = run(lobby(4), [
      join('host'),
      join('kofi'),
      join('esi'),
      say('host', { t: 'sit', color: 'red' }),
      say('kofi', { t: 'sit', color: 'green' }),
      say('esi', { t: 'sit', color: 'blue' }),
      say('host', { t: 'start', empty: 'drop' }),
    ])
    expect(step.room.settings.players).toBe(3)
    expect([seatOf(step.room, 'host'), seatOf(step.room, 'kofi'), seatOf(step.room, 'esi')]).toEqual(['red', 'green', 'yellow'])
    expect(step.room.computers).toEqual([])
  })

  it('refuses a start that is not possible, or not from the host', () => {
    let step = run(lobby(4), [join('host'), join('kofi'), say('host', { t: 'sit', color: 'red' }), say('host', { t: 'start', empty: 'drop' })])
    expect(step.room.phase).toBe('lobby')
    step = run(step.room, [say('kofi', { t: 'start', empty: 'computers' })])
    expect(step.room.phase).toBe('lobby')
    expect(sentTo(step, 'kofi')[0]).toEqual({ t: 'error', code: 'illegal' })
  })

  it('renames, and refuses an empty name', () => {
    let step = run(lobby(), [join('host'), say('host', { t: 'rename', name: '  Ama B ' })])
    expect(step.room.members[0].name).toBe('Ama B')
    step = run(step.room, [say('host', { t: 'rename', name: '   ' })])
    expect(step.room.members[0].name).toBe('Ama B')
  })

  it('sync sends the full room to the asker only', () => {
    const step = run(run(lobby(), [join('host'), join('kofi')]).room, [say('kofi', { t: 'sync' })])
    expect(step.sends).toHaveLength(1)
    expect(step.sends[0]).toMatchObject({ to: 'kofi', msg: { t: 'room' } })
  })
})
```

- [ ] **Step 3: Run them to see them fail:** `npm test -w @ludo/server`. Expected: FAIL, `../src/room` isn't found.

- [ ] **Step 4: Write `packages/server/src/room.ts`.** This is the lobby part. Task 5 adds the game and replaces the marked lines.

```ts
import {
  COLORS,
  createGame,
  currentMover,
  replay,
  SEATS,
  type ClientMessage,
  type Color,
  type ErrorCode,
  type GameEvent,
  type GameState,
  type RoomView,
  type ServerMessage,
  type Settings,
  type TurnTimer,
  type YouView,
} from '@ludo/engine'
import { cleanName, validSettings, validTimer } from './validate'

export const DAY = 24 * 60 * 60 * 1000

export type Member = { id: number; device: string; name: string; connected: boolean; seat?: Color; reactedAt?: number }

export type Room = {
  code: string
  phase: 'lobby' | 'playing' | 'finished'
  host: string
  settings: Settings
  timer: TurnTimer
  members: Member[]
  nextId: number
  computers: Color[]
  covering: Color[]
  paused: boolean
  pausedFor?: Color
  log: GameEvent[]
  seq: number
  /** When the human who has to act runs out of time. */
  deadline?: number
  /** When the computer next acts, for a computer seat or one it's covering. */
  botAt?: number
  lastActive: number
}

export type Input =
  | { type: 'connect'; device: string; name: string }
  | { type: 'disconnect'; device: string }
  | { type: 'message'; device: string; msg: ClientMessage }
  | { type: 'alarm' }

export type Send = { to: 'all' | string; msg: ServerMessage }
/** The room after an input, what to send, when to wake next, and whether the room is over for good. */
export type Step = { room: Room; sends: Send[]; alarm: number; remove: boolean }

type Ctx = { room: Room; sends: Send[]; now: number; random: () => number }

export function createRoom(o: { code: string; device: string; name: string; settings: Settings; timer: TurnTimer; now: number }): Room {
  return {
    code: o.code,
    phase: 'lobby',
    host: o.device,
    settings: o.settings,
    timer: o.timer,
    members: [{ id: 1, device: o.device, name: cleanName(o.name) ?? 'Player', connected: false }],
    nextId: 2,
    computers: [],
    covering: [],
    paused: false,
    log: [],
    seq: 0,
    lastActive: o.now,
  }
}

export function reduce(prev: Room, input: Input, now: number, random: () => number): Step {
  const ctx: Ctx = { room: structuredClone(prev), sends: [], now, random }
  const { room } = ctx
  if (input.type === 'alarm') {
    if (now >= room.lastActive + DAY) return { room, sends: [], alarm: now, remove: true }
    tick(ctx)
  } else {
    room.lastActive = now
    if (input.type === 'connect') connect(ctx, input.device, input.name)
    else if (input.type === 'disconnect') disconnect(ctx, input.device)
    else message(ctx, input.device, input.msg)
  }
  return { room, sends: ctx.sends, alarm: Math.min(room.botAt ?? Infinity, room.deadline ?? Infinity, room.lastActive + DAY), remove: false }
}

export function viewOf(room: Room, now: number): RoomView {
  return {
    code: room.code,
    phase: room.phase,
    host: room.members.find((m) => m.device === room.host)?.id ?? 0,
    settings: room.settings,
    timer: room.timer,
    members: room.members.map(({ id, name, connected, seat }) => ({ id, name, connected, seat })),
    computers: room.computers,
    covering: room.covering,
    paused: room.paused,
    pausedFor: room.pausedFor,
    log: room.log,
    seq: room.seq,
    deadlineIn: room.deadline === undefined ? undefined : Math.max(0, room.deadline - now),
  }
}

const youOf = (room: Room, m: Member): YouView => ({ id: m.id, seat: m.seat, host: room.host === m.device })

export const gameOf = (room: Room): GameState => replay(room.settings, room.log)
/** The seat that has to act: the Labourer owner while they play someone's roll, otherwise the turn player. */
export const actorOf = (game: GameState): Color => currentMover(game) ?? game.turn

const memberOf = (room: Room, device: string) => room.members.find((m) => m.device === device)
const seated = (room: Room) => room.members.filter((m) => m.seat)
const seatConnected = (room: Room, color: Color) => room.members.some((m) => m.seat === color && m.connected)
export const anyoneSeatedConnected = (room: Room) => room.members.some((m) => m.seat && m.connected)

function sendRoom(ctx: Ctx, m: Member): void {
  ctx.sends.push({ to: m.device, msg: { t: 'room', room: viewOf(ctx.room, ctx.now), you: youOf(ctx.room, m) } })
}
const broadcastRoom = (ctx: Ctx) => ctx.room.members.filter((m) => m.connected).forEach((m) => sendRoom(ctx, m))

function refuse(ctx: Ctx, device: string, code: ErrorCode): void {
  ctx.sends.push({ to: device, msg: { t: 'error', code } })
  const m = memberOf(ctx.room, device)
  if (m) sendRoom(ctx, m)
}

/** The next connected seated member in colour order, else any connected member. */
function handOver(room: Room): void {
  const next = COLORS.map((c) => room.members.find((m) => m.seat === c && m.connected)).find(Boolean) ?? room.members.find((m) => m.connected)
  if (next) room.host = next.device
}

function connect(ctx: Ctx, device: string, name: string): void {
  const { room } = ctx
  const wasIdle = !anyoneSeatedConnected(room)
  let m = memberOf(room, device)
  if (m) {
    m.connected = true
    m.name = cleanName(name) ?? m.name
  } else {
    m = { id: room.nextId++, device, name: cleanName(name) ?? 'Player', connected: true }
    room.members.push(m)
  }
  if (!memberOf(room, room.host)?.connected) room.host = device
  const unpaused = room.pausedFor !== undefined && m.seat === room.pausedFor
  if (unpaused) {
    room.paused = false
    room.pausedFor = undefined
  }
  if (room.phase === 'playing' && (wasIdle || unpaused)) schedule(ctx, gameOf(room), ctx.now)
  broadcastRoom(ctx)
}

function disconnect(ctx: Ctx, device: string): void {
  const { room } = ctx
  const m = memberOf(room, device)
  if (!m) return
  m.connected = false
  if (room.phase === 'lobby') m.seat = undefined
  if (room.phase === 'playing') leaveGame(ctx, m) // Task 5
  if (room.host === device) handOver(room)
  broadcastRoom(ctx)
}

function message(ctx: Ctx, device: string, msg: ClientMessage): void {
  const { room } = ctx
  const m = memberOf(room, device)
  if (!m) return
  const host = room.host === device
  switch (msg.t) {
    case 'sit': {
      const free = room.phase === 'lobby' && SEATS[room.settings.players].includes(msg.color) && !room.members.some((o) => o.seat === msg.color)
      if (!free) return refuse(ctx, device, 'illegal')
      m.seat = msg.color
      return broadcastRoom(ctx)
    }
    case 'stand':
      if (room.phase !== 'lobby') return refuse(ctx, device, 'illegal')
      m.seat = undefined
      return broadcastRoom(ctx)
    case 'rejoin':
      return rejoin(ctx, m, msg.color)
    case 'settings': {
      if (!host || room.phase !== 'lobby' || !validSettings(msg.settings) || !validTimer(msg.timer)) return refuse(ctx, device, 'illegal')
      room.settings = msg.settings
      room.timer = msg.timer
      for (const o of room.members) if (o.seat && !SEATS[msg.settings.players].includes(o.seat)) o.seat = undefined
      return broadcastRoom(ctx)
    }
    case 'start':
      if (!host || room.phase !== 'lobby' || !start(ctx, msg.empty)) return refuse(ctx, device, 'illegal')
      return broadcastRoom(ctx)
    case 'rename': {
      const name = cleanName(msg.name)
      if (!name) return refuse(ctx, device, 'illegal')
      m.name = name
      return broadcastRoom(ctx)
    }
    case 'sync':
      return sendRoom(ctx, m)
    default:
      return play(ctx, m, msg) // Task 5: roll, move, stop, pause, resume, react, rematch
  }
}

/** "Rejoin as …": take over a seat whose player has gone. */
function rejoin(ctx: Ctx, m: Member, color: Color): void {
  const { room } = ctx
  const old = room.members.find((o) => o.seat === color)
  if (room.phase === 'lobby' || !old || old.connected || old === m || m.seat) return refuse(ctx, m.device, 'illegal')
  old.seat = undefined
  m.seat = color
  if (room.host === old.device) room.host = m.device
  if (room.pausedFor === color) {
    room.paused = false
    room.pausedFor = undefined
    schedule(ctx, gameOf(room), ctx.now)
  }
  broadcastRoom(ctx)
}

function start(ctx: Ctx, empty: 'computers' | 'drop'): boolean {
  const { room } = ctx
  const people = seated(room)
  if (empty === 'drop') {
    if (people.length < 2) return false
    const n = people.length as 2 | 3 | 4
    const target = SEATS[n]
    const keep = people.filter((m) => target.includes(m.seat!))
    const free = target.filter((c) => !keep.some((m) => m.seat === c))
    people.filter((m) => !keep.includes(m)).forEach((m, i) => (m.seat = free[i]))
    room.settings = { ...room.settings, players: n }
    room.computers = []
  } else {
    if (people.length < 1) return false
    room.computers = SEATS[room.settings.players].filter((c) => !people.some((m) => m.seat === c))
  }
  room.phase = 'playing'
  room.log = []
  room.covering = []
  room.paused = false
  room.pausedFor = undefined
  schedule(ctx, createGame(room.settings), ctx.now)
  return true
}

// Task 5 replaces these with the game.
function schedule(_ctx: Ctx, _game: GameState, _readyAt: number): void {}
function leaveGame(_ctx: Ctx, _m: Member): void {}
function tick(_ctx: Ctx): void {}
function play(ctx: Ctx, m: Member, _msg: ClientMessage): void {
  refuse(ctx, m.device, 'illegal')
}
export { seatConnected }
```

- [ ] **Step 5: Run the tests to see them pass:** `npm test -w @ludo/server && npm run typecheck -w @ludo/server`. Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/server
git commit -m "feat(server): room lobby: join, seats, host, settings, start"
```

```json:metadata
{"files": ["packages/server/src/room.ts", "packages/server/test/helpers.ts", "packages/server/test/lobby.test.ts"], "verifyCommand": "npm test -w @ludo/server", "acceptanceCriteria": ["createRoom/connect/sit/stand/settings/start/handover/rename/sync behave as tested", "refusals send error + room to the sender only", "room view has no device IDs"], "requiresUserVerification": false}
```

---

### Task 5: Room reducer: the game

**Goal:** The room plays the game:
- dice
- human actions, checked
- the computer for computer seats, covered seats and timeouts
- timers paced to the animations
- pausing, reconnecting, reactions, finishing, rematch and expiry

**Files:**
- Modify: `packages/server/src/room.ts` (replace the four Task-5 stubs at the bottom)
- Create: `packages/server/test/play.test.ts`

**Acceptance Criteria:**
- [ ] Only the seat that has to act can roll, move or stop, and not while paused or covered. Illegal moves are refused with `illegal`.
- [ ] Each accepted action appends the engine's logged event, bumps `seq`, sends `event` to all, then sends `clock`.
- [ ] After an event, a computer or covered seat gets `botAt = readyAt + botRoll/botMove`. A human gets `deadline = readyAt + timer`, or nothing with `off`. `readyAt = now + eventMs(before, event)`.
- [ ] The alarm at `botAt` or `deadline` makes the computer play one decision.
- [ ] A disconnected seated player is covered at once. If it's their decision, the computer is scheduled straight away.
- [ ] Covering ends at the start of that seat's next turn, if they're back.
- [ ] Pause (host) stops all clocks. `resume`, or the return of `pausedFor`, restarts them from now.
- [ ] With nobody seated connected, no clock runs. The first one back restarts it.
- [ ] Reactions: seated members only, at most one per 3 s, sent to all. Otherwise `too_fast`.
- [ ] The game ends → phase `finished` and no clocks. Rematch (host) → back to the lobby with the same settings, and disconnected members lose their seats.
- [ ] The alarm 24 h after the last activity returns `remove: true`.

**Verify:** `npm test -w @ludo/server` → lobby and play tests pass.

**Steps:**

- [ ] **Step 1: Write the failing tests** `packages/server/test/play.test.ts`

```ts
import { ANIMATION_TIMING, settingsFor, TIMER_SECONDS } from '@ludo/engine'
import { describe, expect, it } from 'vitest'
import { DAY, gameOf, reduce, type Room } from '../src/room'
import { die, fixedRandom, join, lobby, run, say, sentTo, T0 } from './helpers'

/** Ama (red) and Kofi (yellow) in a 2-player classic room, started at T0. */
function started(timer: Room['timer'] = 'normal'): Room {
  const room = lobby(2)
  room.settings = settingsFor('classic', 2, 'firstWins')
  room.timer = timer
  return run(room, [
    join('host', 'Ama'),
    join('kofi', 'Kofi'),
    say('host', { t: 'sit', color: 'red' }),
    say('kofi', { t: 'sit', color: 'yellow' }),
    say('host', { t: 'start', empty: 'computers' }),
  ]).room
}
const alarm = (room: Room, at: number, random = fixedRandom([die(3)])) => reduce(room, { type: 'alarm' }, at, random)

describe('playing', () => {
  it('the human with the turn has the clock', () => {
    const room = started()
    expect(room.deadline).toBe(T0 + TIMER_SECONDS.normal * 1000)
    expect(room.botAt).toBeUndefined()
  })

  it('a roll is the room’s dice, sent to everyone with a sequence number, then the clock', () => {
    const step = run(started(), [say('host', { t: 'roll' })], T0 + 10, fixedRandom([die(3)]))
    expect(step.room.log).toEqual([{ type: 'roll', value: 3 }])
    expect(sentTo(step, 'kofi')).toContainEqual({ t: 'event', seq: 1, event: { type: 'roll', value: 3 }, by: 'human' })
    expect(sentTo(step, 'kofi').at(-1)).toMatchObject({ t: 'clock', paused: false })
  })

  it('refuses a roll out of turn, and a move that is not legal', () => {
    let step = run(started(), [say('kofi', { t: 'roll' })])
    expect(sentTo(step, 'kofi')[0]).toEqual({ t: 'error', code: 'not_your_turn' })
    step = run(started(), [say('host', { t: 'move', move: { kind: 'enter', piece: { color: 'red', index: 0 }, to: { kind: 'track', index: 0 } } })])
    expect(sentTo(step, 'host')[0]).toEqual({ t: 'error', code: 'illegal' })
  })

  it('a timeout makes the computer play that one decision; the human keeps the seat', () => {
    const room = started()
    const step = alarm(room, room.deadline!)
    expect(step.room.log).toEqual([{ type: 'roll', value: 3 }])
    expect(sentTo(step, 'host')).toContainEqual({ t: 'event', seq: 1, event: { type: 'roll', value: 3 }, by: 'computer' })
    expect(step.room.covering).toEqual([])
  })

  it('the clock waits for the animation: the next deadline is after the dice settle', () => {
    const step = run(started(), [say('host', { t: 'roll' })], T0, fixedRandom([die(3)]))
    // A 3 with everyone in base passes the turn to Kofi, whose clock starts once the dice settle.
    expect(gameOf(step.room).turn).toBe('yellow')
    expect(step.room.deadline).toBe(T0 + ANIMATION_TIMING.roll + TIMER_SECONDS.normal * 1000)
  })

  it('computer seats play by themselves, paced', () => {
    const room = run(lobby(2), [join('host'), say('host', { t: 'sit', color: 'yellow' }), say('host', { t: 'start', empty: 'computers' })]).room
    expect(room.computers).toEqual(['red'])
    expect(room.botAt).toBe(T0 + ANIMATION_TIMING.botRoll)
    expect(alarm(room, room.botAt!).room.log).toHaveLength(1)
  })

  it('no timer: a human is never timed out', () => {
    expect(started('off').deadline).toBeUndefined()
  })

  it('a disconnect is covered at once; the player gets the seat back at their next turn', () => {
    let room = started()
    room = run(room, [{ type: 'disconnect', device: 'host' }], T0 + 5).room
    expect(room.covering).toEqual(['red'])
    expect(room.botAt).toBe(T0 + 5 + ANIMATION_TIMING.botRoll)
    room = run(room, [join('host', 'Ama')], T0 + 6).room
    expect(room.covering).toEqual(['red']) // the computer finishes the decision it has
    room = alarm(room, room.botAt!).room // computer rolls a 3 for red: turn passes to Kofi
    room = run(room, [say('kofi', { t: 'roll' })], room.lastActive + 1000, fixedRandom([die(3)])).room // Kofi's 3 passes back to red
    expect(room.covering).toEqual([])
    expect(room.deadline).toBeDefined()
  })

  it('pause stops every clock; resume restarts it from now', () => {
    let room = run(started(), [say('host', { t: 'pause' })], T0 + 100).room
    expect([room.paused, room.deadline, room.botAt]).toEqual([true, undefined, undefined])
    expect(run(room, [say('host', { t: 'roll' })]).room.log).toEqual([])
    room = run(room, [say('host', { t: 'resume' })], T0 + 5000).room
    expect(room.deadline).toBe(T0 + 5000 + TIMER_SECONDS.normal * 1000)
  })

  it('pausing for a player ends when they come back', () => {
    let room = run(started(), [{ type: 'disconnect', device: 'kofi' }, say('host', { t: 'pause', for: 'yellow' })]).room
    expect(room.pausedFor).toBe('yellow')
    room = run(room, [join('kofi', 'Kofi')], T0 + 10).room
    expect(room.paused).toBe(false)
  })

  it('with nobody seated connected, no clock runs', () => {
    const room = run(started(), [{ type: 'disconnect', device: 'kofi' }, { type: 'disconnect', device: 'host' }]).room
    expect([room.deadline, room.botAt]).toEqual([undefined, undefined])
    expect(run(room, [join('kofi', 'Kofi')], T0 + 50).room.botAt).toBeDefined() // red (covered) acts again
  })

  it('reactions: seated only, one per 3 seconds', () => {
    let step = run(started(), [say('host', { t: 'react', id: 'fire' })], T0)
    expect(sentTo(step, 'kofi')).toContainEqual({ t: 'reaction', color: 'red', id: 'fire' })
    step = run(step.room, [say('host', { t: 'react', id: 'clap' })], T0 + 1000)
    expect(sentTo(step, 'host')[0]).toEqual({ t: 'error', code: 'too_fast' })
    step = run(step.room, [say('host', { t: 'react', id: 'clap' })], T0 + 3000)
    expect(sentTo(step, 'kofi')).toContainEqual({ t: 'reaction', color: 'red', id: 'clap' })
  })

  it('rematch takes everyone back to the lobby with the same settings', () => {
    const room: Room = { ...started(), phase: 'finished', deadline: undefined }
    const step = run(room, [say('host', { t: 'rematch' })])
    expect(step.room.phase).toBe('lobby')
    expect(step.room.log).toEqual([])
    expect(step.room.members.map((m) => m.seat)).toEqual(['red', 'yellow'])
  })

  it('a room is removed a day after its last activity', () => {
    const room = started()
    expect(alarm(room, room.lastActive + DAY).remove).toBe(true)
  })
})
```

> Adjust the fixtures if a scenario's dice don't produce the stated situation. For example, check in the classic rules that a 3 with all pieces in base passes the turn. Keep the behaviour each test asserts.

- [ ] **Step 2: Run them to see them fail:** `npm test -w @ludo/server`. Expected: FAIL. The stubs refuse every action and schedule nothing.

- [ ] **Step 3: Replace the Task 5 stubs at the bottom of `room.ts`** (from `// Task 5 replaces these` to the end) with the following. Add `applyMove`, `chooseMove`, `eventMs`, `REACTIONS`, `roll`, `stopRolling`, `ANIMATION_TIMING` and `TIMER_SECONDS` to the `@ludo/engine` import.

```ts
const REACT_GAP = 3000
const dieRoll = (random: () => number) => 1 + Math.floor(random() * 6)

function clock(ctx: Ctx): void {
  const { room, now } = ctx
  const deadlineIn = room.deadline === undefined ? undefined : room.deadline - now
  ctx.sends.push({ to: 'all', msg: { t: 'clock', deadlineIn, paused: room.paused, pausedFor: room.pausedFor, covering: room.covering } })
}

/**
 * Who acts next and when, once devices have shown the last event (`readyAt`). Covering ends at the
 * start of the covered seat's own turn if its player is back, so the computer finishes a turn it began.
 */
function schedule(ctx: Ctx, game: GameState, readyAt: number): void {
  const { room } = ctx
  room.deadline = room.botAt = undefined
  if (room.phase !== 'playing' || room.paused || !anyoneSeatedConnected(room)) return
  const startOfTurn = game.pendingRoll === undefined && game.queuedRolls.length === 0
  if (startOfTurn) room.covering = room.covering.filter((c) => !(c === game.turn && seatConnected(room, c)))
  const actor = actorOf(game)
  const rolling = game.pendingRoll === undefined
  if (room.computers.includes(actor) || room.covering.includes(actor)) {
    room.botAt = readyAt + (rolling ? ANIMATION_TIMING.botRoll : ANIMATION_TIMING.botMove)
  } else if (room.timer !== 'off') {
    room.deadline = readyAt + TIMER_SECONDS[room.timer] * 1000
  }
}

function step(game: GameState, event: GameEvent): GameState {
  switch (event.type) {
    case 'roll':
      return roll(game, event.value)
    case 'move':
      return applyMove(game, event.move)
    case 'stop':
      return stopRolling(game)
    case 'pass':
      throw new Error('not played in rooms')
  }
}

/** Play an event; false when the engine refuses it. */
function apply(ctx: Ctx, game: GameState, event: GameEvent, by: 'human' | 'computer'): boolean {
  const { room } = ctx
  let next: GameState
  try {
    next = step(game, event)
  } catch {
    return false
  }
  // The engine's own record of it: a move as matched against the legal moves, with its roll count.
  const recorded = next.log.at(-1)!
  room.log.push(recorded)
  room.seq += 1
  ctx.sends.push({ to: 'all', msg: { t: 'event', seq: room.seq, event: recorded, by } })
  if (next.status === 'finished') {
    room.phase = 'finished'
    room.deadline = room.botAt = undefined
  } else {
    schedule(ctx, next, ctx.now + eventMs(game, recorded))
  }
  clock(ctx)
  return true
}

/** The computer plays one decision for whoever has to act. */
function computerAct(ctx: Ctx, game: GameState): void {
  const event: GameEvent =
    game.pendingRoll === undefined ? { type: 'roll', value: dieRoll(ctx.random) } : { type: 'move', move: chooseMove(game, ctx.random)! }
  apply(ctx, game, event, 'computer')
}

function tick(ctx: Ctx): void {
  const { room, now } = ctx
  if (room.phase !== 'playing' || room.paused) return
  const due = room.botAt ?? room.deadline
  if (due === undefined || now < due) return
  computerAct(ctx, gameOf(room))
}

function leaveGame(ctx: Ctx, m: Member): void {
  const { room } = ctx
  if (!m.seat || room.computers.includes(m.seat)) return
  if (!room.covering.includes(m.seat)) room.covering.push(m.seat)
  schedule(ctx, gameOf(room), ctx.now)
  clock(ctx)
}

function play(ctx: Ctx, m: Member, msg: ClientMessage): void {
  const { room, now } = ctx
  const host = room.host === m.device
  switch (msg.t) {
    case 'roll':
    case 'move':
    case 'stop': {
      if (room.phase !== 'playing' || room.paused) return refuse(ctx, m.device, 'not_your_turn')
      const game = gameOf(room)
      const actor = actorOf(game)
      if (m.seat !== actor || room.computers.includes(actor) || room.covering.includes(actor)) return refuse(ctx, m.device, 'not_your_turn')
      const event: GameEvent =
        msg.t === 'roll' ? { type: 'roll', value: dieRoll(ctx.random) } : msg.t === 'move' ? { type: 'move', move: msg.move } : { type: 'stop' }
      if (!apply(ctx, game, event, 'human')) refuse(ctx, m.device, 'illegal')
      return
    }
    case 'pause':
      if (!host || room.phase !== 'playing' || room.paused) return refuse(ctx, m.device, 'illegal')
      room.paused = true
      room.pausedFor = msg.for
      room.deadline = room.botAt = undefined
      return clock(ctx)
    case 'resume':
      if (!host || !room.paused) return refuse(ctx, m.device, 'illegal')
      room.paused = false
      room.pausedFor = undefined
      schedule(ctx, gameOf(room), now)
      return clock(ctx)
    case 'react':
      if (!m.seat || !REACTIONS.includes(msg.id)) return refuse(ctx, m.device, 'illegal')
      if (m.reactedAt !== undefined && now - m.reactedAt < REACT_GAP) return refuse(ctx, m.device, 'too_fast')
      m.reactedAt = now
      ctx.sends.push({ to: 'all', msg: { t: 'reaction', color: m.seat, id: msg.id } })
      return
    case 'rematch':
      if (!host || room.phase !== 'finished') return refuse(ctx, m.device, 'illegal')
      room.phase = 'lobby'
      room.log = []
      room.computers = []
      room.covering = []
      room.paused = false
      room.pausedFor = undefined
      room.deadline = room.botAt = undefined
      for (const o of room.members) if (!o.connected) o.seat = undefined
      return broadcastRoom(ctx)
    default:
      return refuse(ctx, m.device, 'illegal')
  }
}
```

Delete the temporary `export { seatConnected }` line too.

> **`refuse` sends the full room on purpose,** so the device that sent a refused action catches up. The `react` refusal sends it as well. That's harmless, but the `too_fast` test asserts only `sendTo(step,'host')[0]`, so keep the error first.

- [ ] **Step 4: Run the tests to see them pass:** `npm test -w @ludo/server && npm run typecheck -w @ludo/server`. Expected: PASS for both files.

- [ ] **Step 5: Commit**

```bash
git add packages/server
git commit -m "feat(server): rooms play the game: dice, turns, computer cover, timers, pause, reactions, rematch"
```

```json:metadata
{"files": ["packages/server/src/room.ts", "packages/server/test/play.test.ts"], "verifyCommand": "npm test -w @ludo/server", "acceptanceCriteria": ["only the acting seat can act; illegal refused", "events numbered and broadcast, then clock", "timeouts/computer seats/covered seats act on the alarm, paced by eventMs", "covering ends at the seat's next turn when back", "pause/resume/pausedFor/self-pause", "reactions limited", "finish, rematch, expiry"], "requiresUserVerification": false}
```

---
### Task 6: Durable Object, Worker routes and config

**Goal:** Rooms run on Cloudflare: HTTP to create and look up rooms, WebSockets to play, storage and alarms. The Worker also keeps serving the app.

**Files:**
- Create: `packages/server/src/RoomObject.ts`, `packages/server/src/index.ts`, `packages/server/wrangler.jsonc`, `packages/server/test/api.test.ts`, `packages/server/test/globalSetup.ts`
- Delete: `packages/web/wrangler.jsonc`
- Modify: `packages/server/vitest.config.ts`, `packages/web/vite.config.ts` (the dev proxy)

**Acceptance Criteria:**
- [ ] `POST /api/rooms` returns `{ code }` and makes the Durable Object named by that code. A bad body gets 400, and more than 3 per minute from one IP gets 429.
- [ ] `GET /api/rooms/:code` returns `RoomInfo`, or 404.
- [ ] The socket checks the protocol version (`old_version`) and that the room exists (`not_found`). The newest socket of a device wins (`replaced`).
- [ ] Every input goes through `reduce`. The room is saved, the alarm set, and the sends delivered by device tag. `remove` deletes the storage and closes the sockets.
- [ ] Only `/api/*` reaches the Worker. Everything else is served as static assets with the single-page fallback.
- [ ] `vite dev` proxies `/api` (WebSockets included) to `wrangler dev` on port 8787.

**Verify:** `npm test -w @ludo/server` → validate, lobby, play and api tests pass. Then `cd packages/server && npx wrangler deploy --dry-run` → succeeds.

**Steps:**

- [ ] **Step 1: Create `packages/server/wrangler.jsonc`** (and delete `packages/web/wrangler.jsonc`)

```jsonc
{
  "$schema": "../../node_modules/wrangler/config-schema.json",
  "name": "ludo-unlimited",
  "main": "src/index.ts",
  "compatibility_date": "2026-11-01",
  // The built app is served as static files; only /api reaches the Worker. Unknown paths fall back to index.html.
  "assets": { "directory": "../web/dist", "not_found_handling": "single-page-application", "run_worker_first": ["/api/*"] },
  // One Durable Object per room, named by its code.
  "durable_objects": { "bindings": [{ "name": "ROOMS", "class_name": "RoomObject" }] },
  "migrations": [{ "tag": "v1", "new_sqlite_classes": ["RoomObject"] }],
  // Room creation: 3 a minute per IP (the binding only allows 10 or 60 second windows).
  "ratelimits": [{ "name": "CREATE_LIMIT", "namespace_id": "1001", "simple": { "limit": 3, "period": 60 } }],
  "routes": [{ "pattern": "ludo.thedumbtechguy.com", "custom_domain": true }],
  // One home for the game: no duplicate *.workers.dev address (saved games and the installed app are per address).
  "workers_dev": false,
  // Pull requests built by Cloudflare get their own preview link.
  "preview_urls": true,
  // Request logs and errors in the dashboard.
  "observability": { "enabled": true, "head_sampling_rate": 1 }
}
```

> Cloudflare may refuse preview URLs for a Worker that defines a Durable Object class. If the dry run or a deploy says so, set `"preview_urls": false` and add a comment saying why.

- [ ] **Step 2: Write `packages/server/src/RoomObject.ts`**

```ts
import { PROTOCOL_VERSION, SEATS, type ClientMessage, type ErrorCode, type RoomInfo, type Settings, type TurnTimer } from '@ludo/engine'
import { DurableObject } from 'cloudflare:workers'
import { createRoom, DAY, reduce, type Input, type Room } from './room'

export type Env = { ROOMS: DurableObjectNamespace<RoomObject>; CREATE_LIMIT: RateLimit }

const MAX_MESSAGE = 2048
const random = () => crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32

/** One room: its state in storage, its players' sockets (tagged with their device ID), its alarm. */
export class RoomObject extends DurableObject<Env> {
  /** null once we know there's no room here. */
  private room?: Room | null

  private async load(): Promise<Room | undefined> {
    if (this.room === undefined) this.room = (await this.ctx.storage.get<Room>('room')) ?? null
    return this.room ?? undefined
  }

  /** Make the room; false when this code is already taken. */
  async create(o: { code: string; device: string; name: string; settings: Settings; timer: TurnTimer }): Promise<boolean> {
    if (await this.load()) return false
    this.room = createRoom({ ...o, now: Date.now() })
    await this.ctx.storage.put('room', this.room)
    await this.ctx.storage.setAlarm(this.room.lastActive + DAY)
    return true
  }

  async info(): Promise<RoomInfo | undefined> {
    const room = await this.load()
    if (!room) return undefined
    const taken = room.members.filter((m) => m.seat).length
    return { phase: room.phase, players: room.settings.players, seatsFree: room.phase === 'lobby' ? SEATS[room.settings.players].length - taken : 0 }
  }

  /** The WebSocket upgrade, forwarded by the Worker. */
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)
    const device = url.searchParams.get('device') ?? ''
    const [client, server] = Object.values(new WebSocketPair())
    const refuse = (code: ErrorCode) => {
      server.accept()
      server.send(JSON.stringify({ t: 'error', code }))
      server.close(4000, code)
      return new Response(null, { status: 101, webSocket: client })
    }
    if (Number(url.searchParams.get('v')) !== PROTOCOL_VERSION) return refuse('old_version')
    if (!device || device.length > 64 || !(await this.load())) return refuse('not_found')
    // The same device in another tab: the newest one plays.
    for (const old of this.ctx.getWebSockets(device)) {
      old.send(JSON.stringify({ t: 'error', code: 'replaced' }))
      old.close(4001, 'replaced')
    }
    this.ctx.acceptWebSocket(server, [device])
    await this.apply({ type: 'connect', device, name: url.searchParams.get('name') ?? '' })
    return new Response(null, { status: 101, webSocket: client })
  }

  async webSocketMessage(ws: WebSocket, data: string | ArrayBuffer): Promise<void> {
    if (typeof data !== 'string' || data.length > MAX_MESSAGE) return
    let msg: ClientMessage
    try {
      msg = JSON.parse(data)
    } catch {
      return
    }
    if (typeof msg?.t !== 'string') return
    await this.apply({ type: 'message', device: this.ctx.getTags(ws)[0], msg })
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    const device = this.ctx.getTags(ws)[0]
    // A replaced tab closing doesn't mean the player left.
    if (this.ctx.getWebSockets(device).some((other) => other !== ws && other.readyState === WebSocket.OPEN)) return
    await this.apply({ type: 'disconnect', device })
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    await this.webSocketClose(ws)
  }

  async alarm(): Promise<void> {
    await this.apply({ type: 'alarm' })
  }

  private async apply(input: Input): Promise<void> {
    const room = await this.load()
    if (!room) return
    const step = reduce(room, input, Date.now(), random)
    if (step.remove) {
      this.room = null
      for (const ws of this.ctx.getWebSockets()) {
        ws.send(JSON.stringify({ t: 'error', code: 'not_found' }))
        ws.close(4000, 'not_found')
      }
      await this.ctx.storage.deleteAll()
      return
    }
    this.room = step.room
    await this.ctx.storage.put('room', step.room)
    await this.ctx.storage.setAlarm(step.alarm)
    for (const { to, msg } of step.sends) {
      const text = JSON.stringify(msg)
      for (const ws of to === 'all' ? this.ctx.getWebSockets() : this.ctx.getWebSockets(to)) {
        try {
          ws.send(text)
        } catch {
          // Closing as we send: its close handler deals with it.
        }
      }
    }
  }
}
```

- [ ] **Step 3: Write `packages/server/src/index.ts`**

```ts
import type { Env } from './RoomObject'
import { cleanName, makeCode, validSettings, validTimer } from './validate'

export { RoomObject } from './RoomObject'

const json = (body: unknown, status = 200) => Response.json(body, { status })

/** /api/rooms (create), /api/rooms/:code (look up), /api/rooms/:code/socket (play). Everything else is static assets. */
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const [api, rooms, rawCode, socket] = new URL(request.url).pathname.split('/').filter(Boolean)
    if (api !== 'api' || rooms !== 'rooms') return json({ error: 'not_found' }, 404)
    if (!rawCode) return request.method === 'POST' ? create(request, env) : json({ error: 'not_found' }, 404)
    const code = rawCode.toUpperCase()
    if (!/^[A-Z]{4}$/.test(code)) return json({ error: 'not_found' }, 404)
    const room = env.ROOMS.get(env.ROOMS.idFromName(code))
    if (socket === 'socket' && request.headers.get('Upgrade') === 'websocket') return room.fetch(request)
    if (!socket && request.method === 'GET') {
      const info = await room.info()
      return info ? json(info) : json({ error: 'not_found' }, 404)
    }
    return json({ error: 'not_found' }, 404)
  },
} satisfies ExportedHandler<Env>

async function create(request: Request, env: Env): Promise<Response> {
  const ip = request.headers.get('CF-Connecting-IP') ?? 'local'
  if (!(await env.CREATE_LIMIT.limit({ key: ip })).success) return json({ error: 'too_fast' }, 429)
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
  const device = body?.device
  const name = cleanName(body?.name)
  if (typeof device !== 'string' || !device || device.length > 64 || !name || !validSettings(body?.settings) || !validTimer(body?.timer)) {
    return json({ error: 'bad_request' }, 400)
  }
  // A clash with a live room is rare (23^4 codes); try a few times.
  for (let i = 0; i < 5; i++) {
    const code = makeCode(Math.random)
    if (await env.ROOMS.get(env.ROOMS.idFromName(code)).create({ code, device, name, settings: body.settings, timer: body.timer })) {
      return json({ code })
    }
  }
  return json({ error: 'busy' }, 503)
}
```

- [ ] **Step 4: Point the tests at the real config.** `packages/server/test/globalSetup.ts` makes sure the assets folder exists, because CI runs the tests before building the app:

```ts
import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

export default function setup(): void {
  mkdirSync(fileURLToPath(new URL('../../web/dist', import.meta.url)), { recursive: true })
}
```

Then update `packages/server/vitest.config.ts`:

```ts
import { cloudflareTest } from '@cloudflare/vitest-plugin'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [cloudflareTest({ wrangler: { configPath: './wrangler.jsonc' } })],
  test: { include: ['test/**/*.test.ts'], globalSetup: ['./test/globalSetup.ts'] },
})
```

- [ ] **Step 5: Write `packages/server/test/api.test.ts`**

```ts
import { PROTOCOL_VERSION, settingsFor, type ServerMessage } from '@ludo/engine'
import { exports } from 'cloudflare:workers'
import { describe, expect, it } from 'vitest'

const BASE = 'http://ludo.test'
let ipCounter = 0
const create = (body: unknown) =>
  exports.default.fetch(`${BASE}/api/rooms`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': `10.0.0.${++ipCounter}` },
    body: JSON.stringify(body),
  })
const goodBody = { device: 'host', name: 'Ama', settings: settingsFor('ghana', 4, 'firstWins'), timer: 'normal' }

/** Open a socket and collect what it's sent. */
async function open(code: string, device: string, v = PROTOCOL_VERSION) {
  const res = await exports.default.fetch(`${BASE}/api/rooms/${code}/socket?device=${device}&name=${device}&v=${v}`, { headers: { Upgrade: 'websocket' } })
  const ws = res.webSocket!
  const got: ServerMessage[] = []
  ws.addEventListener('message', (e) => got.push(JSON.parse(e.data as string)))
  ws.accept()
  return { ws, got }
}
const settle = () => new Promise((r) => setTimeout(r, 50))

describe('api', () => {
  it('creates a room and looks it up', async () => {
    const res = await create(goodBody)
    expect(res.status).toBe(200)
    const { code } = (await res.json()) as { code: string }
    expect(code).toMatch(/^[A-Z]{4}$/)
    const info = await exports.default.fetch(`${BASE}/api/rooms/${code.toLowerCase()}`)
    expect(await info.json()).toEqual({ phase: 'lobby', players: 4, seatsFree: 4 })
  })

  it('refuses a bad body and an unknown code', async () => {
    expect((await create({ ...goodBody, timer: 'forever' })).status).toBe(400)
    expect((await exports.default.fetch(`${BASE}/api/rooms/ZZZZ`)).status).toBe(404)
  })

  it('two devices join over sockets and both hear about each other', async () => {
    const { code } = (await (await create(goodBody)).json()) as { code: string }
    const host = await open(code, 'host')
    const kofi = await open(code, 'kofi')
    host.ws.send(JSON.stringify({ t: 'sit', color: 'red' }))
    await settle()
    const last = host.got.filter((m) => m.t === 'room').at(-1)
    expect(last).toMatchObject({ t: 'room', you: { host: true }, room: { members: [{ name: 'host', seat: 'red' }, { name: 'kofi' }] } })
    expect(kofi.got.some((m) => m.t === 'room')).toBe(true)
  })

  it('tells an old app to update, and an unknown room that it is gone', async () => {
    const { code } = (await (await create(goodBody)).json()) as { code: string }
    const old = await open(code, 'x', PROTOCOL_VERSION - 1)
    const lost = await open('QQQQ', 'y')
    await settle()
    expect(old.got).toEqual([{ t: 'error', code: 'old_version' }])
    expect(lost.got).toEqual([{ t: 'error', code: 'not_found' }])
  })
})
```

> If `exports` from `cloudflare:workers` isn't available in this plugin version, use `SELF` from `cloudflare:test` (the older name). The fetch calls are the same.

- [ ] **Step 6: Proxy the API in development.** In `packages/web/vite.config.ts`, add a `server` block next to `plugins`:

```ts
  // `npm run dev -w @ludo/server` runs the rooms on 8787; the app's /api calls (and sockets) go there.
  server: { proxy: { '/api': { target: 'http://localhost:8787', ws: true } } },
```

- [ ] **Step 7: Run everything**

```bash
npm test -w @ludo/server && npm run typecheck -w @ludo/server
cd packages/server && npx wrangler deploy --dry-run && cd ../..
npm test -w @ludo/web
```

Expected: all pass, and the dry run lists the `ROOMS` Durable Object, the `CREATE_LIMIT` rate limiter and the assets.

- [ ] **Step 8: Commit**

```bash
git add -A packages/server packages/web/wrangler.jsonc packages/web/vite.config.ts
git commit -m "feat(server): rooms on Durable Objects: create, look up, play over WebSockets"
```

> **Deploy note for the user (not done by this task):** the Workers Builds deploy command must become `npx wrangler deploy --config packages/server/wrangler.jsonc` before the next push to main.

```json:metadata
{"files": ["packages/server/src/RoomObject.ts", "packages/server/src/index.ts", "packages/server/wrangler.jsonc", "packages/server/vitest.config.ts", "packages/server/test/api.test.ts", "packages/server/test/globalSetup.ts", "packages/web/vite.config.ts", "packages/web/wrangler.jsonc"], "verifyCommand": "npm test -w @ludo/server && cd packages/server && npx wrangler deploy --dry-run", "acceptanceCriteria": ["create/info/socket routes work", "version and not_found checks", "newest socket wins", "storage, alarm and sends wired through reduce", "assets served for non-/api paths", "dev proxy"], "requiresUserVerification": false}
```

---

### Task 7: Web: split `useGame` into a view and a source

**Goal:** A `useGameView` hook that applies game events and animates them, fed by any source. `useGame` becomes the local source (dice and computer seats). Nothing changes for the player.

**Files:**
- Create: `packages/web/src/useGameView.ts`
- Modify: `packages/web/src/useGame.ts` (rewritten on top of `useGameView`)
- Test: the existing `packages/web/src/useGame.test.ts`, plus new cases in `packages/web/src/useGameView.test.ts`

**Acceptance Criteria:**
- [ ] `useGameView({ initial, timing, controls, you, act, onChange })` returns everything `useGame` returned, plus `enqueue(event)`, `reset(state)`, `busy` and `controls`.
- [ ] Events queue up while a roll or move is animating, and play in order.
- [ ] `roll()`, `play(move)`, `stop()` and `select(piece)` call `act` with an intent. They never change the game directly.
- [ ] A person with a single real choice has it played through `act` after `timing.botMove`.
- [ ] All existing `useGame`, `GameScreen` and `App` tests pass without changes, apart from imports.

**Verify:** `npm test -w @ludo/web` → all pass, plus the new `useGameView` tests.

**Steps:**

- [ ] **Step 1: Write the failing test** `packages/web/src/useGameView.test.ts`

```ts
import { createGame, settingsFor, track } from '@ludo/engine'
import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FAST_TIMING } from './useGame'
import { useGameView } from './useGameView'

const settings = settingsFor('classic', 2, 'firstWins')

describe('useGameView', () => {
  afterEach(() => vi.useRealTimers())

  it('plays events from any source, in order, even while one is animating', () => {
    vi.useFakeTimers()
    const timing = { botRoll: 0, botMove: 0, step: 100, roll: 300 }
    const { result } = renderHook(() => useGameView({ initial: createGame(settings), timing, controls: () => false, act: vi.fn() }))
    act(() => {
      result.current.enqueue({ type: 'roll', value: 6 })
      result.current.enqueue({ type: 'roll', value: 2 })
    })
    expect(result.current.rolling).toBe(true)
    act(() => vi.advanceTimersByTime(300))
    expect(result.current.game.queuedRolls).toEqual([6])
    act(() => vi.advanceTimersByTime(300))
    expect(result.current.game.pendingRoll).toBe(6)
  })

  it('a person’s actions become intents for the source, not changes to the game', () => {
    const intents = vi.fn()
    const { result } = renderHook(() => useGameView({ initial: createGame(settings), timing: FAST_TIMING, controls: () => true, act: intents }))
    act(() => result.current.roll())
    expect(intents).toHaveBeenCalledWith({ t: 'roll' })
    expect(result.current.game.log).toEqual([])
  })

  it('reset replaces the game and drops anything queued', () => {
    const { result } = renderHook(() => useGameView({ initial: createGame(settings), timing: FAST_TIMING, controls: () => false, act: vi.fn() }))
    const later = createGame(settings)
    later.players[0].pieces[0] = track(9)
    act(() => result.current.reset(later))
    expect(result.current.game.players[0].pieces[0]).toEqual(track(9))
  })
})
```

- [ ] **Step 2: Run it to see it fail:** `npx vitest run src/useGameView.test.ts` in `packages/web`. Expected: FAIL, the module isn't found.

- [ ] **Step 3: Create `packages/web/src/useGameView.ts`.** Move the state, animation, effects, callout and selection logic out of `useGame.ts` with as few changes as possible:

- These move unchanged: the `Animation` type, `stepSound`, `KEPT_EFFECTS`, the `Callout` types, `samePiece`, `emit`, `land`, `showCallout`, the animation-stepping effect, and the derived values (`movable`, `targets`, `turnRolls`, `currentIndex`, `canStop`, `moving`).
- The old `applyRoll(value)` stays `applyRoll`. The old `roll()` body becomes `showRoll(value)`: it no longer calls `dice()`, it takes the value.
- The old `play(move)` body becomes `showMove(move)`, and the old `stop()` body becomes `showStop()`.
- `finishCallout` takes `you` from the options, not from `firstHuman(seats, …)`.
- `seatOf(...) === 'human'` becomes `controls(color)` in `humanToRoll` and `humanToMove`.

The new parts are below. Put them inside `useGameView`, after the state declarations.

```ts
/** What a person wants to do; the source (this device, or the room) turns it into a game event. */
export type Intent = { t: 'roll' } | { t: 'move'; move: Move } | { t: 'stop' }

export type ViewOptions = {
  initial: GameState
  timing: Timing
  /** Whether a person on this device makes this colour's decisions right now. */
  controls: (color: Color) => boolean
  /** The first person on this device, called "You". */
  you?: Color
  act: (intent: Intent) => void
  onChange?: (game: GameState) => void
}

// …inside useGameView({ initial, timing, controls, you, act, onChange }):

  // Events wait here while a roll or move is still being shown.
  const queue = useRef<GameEvent[]>([])
  const [queued, setQueued] = useState(0)
  const busy = animation !== undefined || rolling || queued > 0

  function enqueue(event: GameEvent) {
    queue.current.push(event)
    setQueued(queue.current.length)
  }

  function show(event: GameEvent) {
    switch (event.type) {
      case 'roll':
        return showRoll(event.value)
      case 'move':
        return showMove(event.move)
      case 'stop':
        return showStop()
      case 'pass':
        return setGame(pass(game))
    }
  }

  useEffect(() => {
    if (animation || rolling || queue.current.length === 0) return
    const event = queue.current.shift()!
    setQueued(queue.current.length)
    show(event)
  }, [animation, rolling, queued, game])

  /** Start over from `next` (a fresh game, or a resync), dropping anything in flight. */
  function reset(next: GameState) {
    clearTimeout(rollTimer.current)
    clearTimeout(wickedTimer.current)
    queue.current = []
    setQueued(0)
    setAnimation(undefined)
    setRollingTo(undefined)
    setSelected(undefined)
    setCallout(undefined)
    setWasted(undefined)
    setMessage(undefined)
    setGame(next)
  }

  const humanToRoll = !busy && game.status === 'playing' && game.pendingRoll === undefined && controls(game.turn)
  const humanToMove = !busy && mover !== undefined && controls(mover)

  const roll = () => act({ t: 'roll' })
  const stop = () => act({ t: 'stop' })
  function play(move: Move) {
    setSelected(undefined)
    act({ t: 'move', move })
  }
  function select(piece: PieceId) {
    const own = moves.filter((m) => samePiece(m.piece, piece))
    if (own.length === 1) play(own[0])
    else setSelected(piece)
  }

  // A person with a single real choice has nothing to choose: it plays after a short beat.
  useEffect(() => {
    if (!humanToMove) return
    const only = realChoices(legalMoves(game))
    if (only.length !== 1) return
    const id = setTimeout(() => play(only[0]), timing.botMove)
    return () => clearTimeout(id)
  }, [game, humanToMove])
```

Return everything the old hook returned, plus `enqueue`, `reset`, `busy` and `controls`. Also export the `Callout` type from here.

- [ ] **Step 4: Rewrite `packages/web/src/useGame.ts`** as the local source:

```ts
import { chooseMove, createGame, currentMover, replay, ANIMATION_TIMING, WICKED_DELAY, type Color, type GameEvent, type GameState, type Settings, type Timing } from '@ludo/engine'
import { useEffect, useState } from 'react'
import type { Dice } from './dice'
import { firstHuman } from './labels'
import type { Seats } from './types'
import { useGameView, type Intent } from './useGameView'

export type { Timing } from '@ludo/engine'
export type { Callout } from './useGameView'
export const NORMAL_TIMING: Timing = ANIMATION_TIMING
export const FAST_TIMING: Timing = { botRoll: 0, botMove: 0, step: 0, roll: 0 }
export { WICKED_DELAY }

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

/** A game on this device: its own dice, and the computer playing the computer seats. */
export function useGame({ settings, seats, dice, timing, log, initial, random = Math.random, onChange }: GameOptions) {
  const [start] = useState(() => initial ?? (log ? replay(settings, log) : createGame(settings)))
  const seatOf = (color: Color) => seats[color] ?? 'computer'
  const toEvent = (intent: Intent): GameEvent =>
    intent.t === 'roll' ? { type: 'roll', value: dice() } : intent.t === 'move' ? { type: 'move', move: intent.move } : { type: 'stop' }
  const view = useGameView({
    initial: start,
    timing,
    onChange,
    you: firstHuman(seats, start.players.map((p) => p.color)),
    controls: (color) => seatOf(color) === 'human',
    act: (intent) => view.enqueue(toEvent(intent)),
  })
  const { game, busy } = view

  // Computer seats roll and move by themselves.
  useEffect(() => {
    if (busy || game.status !== 'playing') return
    if (game.pendingRoll === undefined) {
      if (seatOf(game.turn) !== 'computer') return
      const id = setTimeout(() => view.enqueue({ type: 'roll', value: dice() }), timing.botRoll)
      return () => clearTimeout(id)
    }
    const mover = currentMover(game)
    if (mover && seatOf(mover) === 'computer') {
      const id = setTimeout(() => view.enqueue({ type: 'move', move: chooseMove(game, random)! }), timing.botMove)
      return () => clearTimeout(id)
    }
  }, [game, busy])

  return view
}
```

Then update any import of `Callout` from `./useGame` (in `KickCallout.tsx`). The re-export keeps it working.

- [ ] **Step 5: Run the whole web suite:** `npm test -w @ludo/web && npm run typecheck -w @ludo/web`. Expected: all pass.

If a `useGame` test now needs one extra `act()` flush, because events go through the queue's effect, wrap the call in `act` as the test already does. Don't change what it asserts.

- [ ] **Step 6: Run the browser tests:** `npm run e2e -w @ludo/web`. Expected: 4 passed.

- [ ] **Step 7: Commit**

```bash
git add packages/web/src
git commit -m "refactor(web): useGameView shows events from any source; useGame is the local source"
```

```json:metadata
{"files": ["packages/web/src/useGameView.ts", "packages/web/src/useGame.ts", "packages/web/src/useGameView.test.ts"], "verifyCommand": "npm test -w @ludo/web && npm run e2e -w @ludo/web", "acceptanceCriteria": ["useGameView queues and animates events in order", "actions become intents via act", "reset works", "all existing web tests and e2e pass"], "requiresUserVerification": false}
```

---

### Task 8: Web: `GameView` takes a controller

**Goal:** The game screen's body renders from a controller `g` and plain props, so the local and online games share it.

**Files:**
- Create: `packages/web/src/screens/GameView.tsx`
- Modify: `packages/web/src/screens/GameScreen.tsx` (a thin local wrapper)

**Acceptance Criteria:**
- [ ] `GameView` has no `useGame` call and no `options`. It gets `g` (the `useGameView` return), `viewer`, `you`, `names`, `animated`, `rules`, `quitLabel`, `onQuit`, an optional `onRestart` (no Restart row without it), `onFinish`, and the device-preference props.
- [ ] `GameScreen` keeps its current props and renders `GameView`.
- [ ] All `GameScreen` tests pass unchanged.

**Verify:** `npm test -w @ludo/web` → all pass.

**Steps:**

- [ ] **Step 1: Create `GameView.tsx`** by moving the whole `GameScreen` function body into `export function GameView(props: GameViewProps)`. Make these replacements:
  - `const g = useGame(options)` → `g` comes from props.
  - `options.timing.step > 0` (3 places) → `animated`.
  - `options.settings.rules` → `rules`.
  - `viewerOf(options.seats, colors)` → `viewer`.
  - `seatNames(options.seats, colors)` → `names`.
  - `firstHuman(options.seats, colors)` → `you`.
  - `options.seats[g.wasted.color] === 'human'` → `g.controls(g.wasted.color)`.
  - The Restart row renders only `{onRestart && (...)}`, and the Quit row's text is `{quitLabel}`.

```ts
export type GameViewProps = {
  g: ReturnType<typeof useGameView>
  /** Whose yard is drawn at this device's corner. */
  viewer: Color
  /** The first person on this device ("Your turn"); none when only computers play. */
  you?: Color
  names: Partial<Record<Color, string>>
  animated: boolean
  rules: Rules
  quitLabel: string
  onQuit: () => void
  onRestart?: () => void
  onFinish: (game: GameState) => void
  hand: Hand
  onHand: (hand: Hand) => void
  theme: ThemePref
  onTheme: (theme: ThemePref) => void
  effectsLevel: EffectsLevel
  onEffectsLevel: (level: EffectsLevel) => void
  sound: boolean
  onSound: (on: boolean) => void
  music: boolean
  onMusic: (on: boolean) => void
}
```

- [ ] **Step 2: Rewrite `GameScreen.tsx`**

```tsx
import { firstHuman, seatNames } from '../labels'
import { viewerOf } from '../layout'
import { useGame, type GameOptions } from '../useGame'
import { GameView, type GameViewProps } from './GameView'

type Props = Omit<GameViewProps, 'g' | 'viewer' | 'you' | 'names' | 'animated' | 'rules' | 'quitLabel'> & { options: GameOptions; onRestart: () => void }

/** A game on this device. */
export function GameScreen({ options, ...rest }: Props) {
  const g = useGame(options)
  const colors = g.game.players.map((p) => p.color)
  return (
    <GameView
      g={g}
      viewer={viewerOf(options.seats, colors)}
      you={firstHuman(options.seats, colors)}
      names={seatNames(options.seats, colors)}
      animated={options.timing.step > 0}
      rules={options.settings.rules}
      quitLabel="Quit to home"
      {...rest}
    />
  )
}
```

Move `THEME_NAME` (and the other name maps) into `GameView.tsx`. Re-export `THEME_NAME` from `GameScreen.tsx` if anything imports it from there: check with `grep -rn THEME_NAME packages/web/src`.

- [ ] **Step 3: Run the suite:** `npm test -w @ludo/web && npm run typecheck -w @ludo/web`. Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add packages/web/src/screens
git commit -m "refactor(web): GameView renders any game controller; GameScreen wraps the local one"
```

```json:metadata
{"files": ["packages/web/src/screens/GameView.tsx", "packages/web/src/screens/GameScreen.tsx"], "verifyCommand": "npm test -w @ludo/web", "acceptanceCriteria": ["GameView takes g and props, no useGame", "GameScreen keeps its props", "existing tests pass"], "requiresUserVerification": false}
```

---
### Task 9: Web: the connection and `useOnlineGame`

**Goal:** A device identity, the API calls, a reconnecting socket, and the online controller: the same shape as `useGame`, with the room's state on top.

**Files:**
- Create: `packages/web/src/online/api.ts`, `packages/web/src/online/socket.ts`, `packages/web/src/online/useOnlineGame.ts`, `packages/web/src/online/socket.test.ts`, `packages/web/src/online/useOnlineGame.test.ts`
- Modify: `packages/web/src/storage.ts` (+ `storage.test.ts`)

**Acceptance Criteria:**
- [ ] `loadDevice()` makes a random ID once and keeps it. `loadName()` and `saveName()` keep the nickname. All of them work when storage is blocked: the device ID then lasts until the page closes.
- [ ] The socket reconnects after a drop, waiting 0.5 s, then doubling up to 8 s, and resets the wait once open. `close()` stops it for good.
- [ ] `useOnlineGame`:
  - A `room` message resets the board from the log, but only when `seq` differs or the room is in the lobby.
  - An `event` with the next `seq` is queued and animated. A gap sends `sync`.
  - Your seat is controlled only when it isn't covered, the game isn't paused, and no intent is waiting for an answer.
  - Intents are sent as messages.
  - `clock` sets a local deadline from `deadlineIn`. Reactions show for 2 s.
  - The errors `not_found`, `old_version` and `replaced` stop the connection and are exposed.

**Verify:** `npm test -w @ludo/web` → all pass, including the new tests.

**Steps:**

- [ ] **Step 1: Add the storage functions and their tests.** In `packages/web/src/storage.ts`:

```ts
const DEVICE_KEY = 'ludo-unlimited:device'
const NAME_KEY = 'ludo-unlimited:name'
let sessionDevice: string | undefined

/** This device's random ID, which lets a room recognise it on return. Made once and kept. */
export function loadDevice(): string {
  try {
    const stored = localStorage.getItem(DEVICE_KEY)
    if (stored) return stored
    const id = crypto.randomUUID()
    localStorage.setItem(DEVICE_KEY, id)
    return id
  } catch {
    // Storage blocked: an ID for as long as the page is open.
    return (sessionDevice ??= crypto.randomUUID())
  }
}

export function loadName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? ''
  } catch {
    return ''
  }
}

export function saveName(name: string): void {
  try {
    localStorage.setItem(NAME_KEY, name)
  } catch {
    // The name just won't be remembered.
  }
}
```

Tests, appended to `storage.test.ts`. Follow that file's existing pattern for blocked storage:

```ts
it('keeps one device ID', () => {
  const id = loadDevice()
  expect(id).toMatch(/^[0-9a-f-]{36}$/)
  expect(loadDevice()).toBe(id)
})

it('remembers the nickname', () => {
  saveName('Kofi')
  expect(loadName()).toBe('Kofi')
})
```

- [ ] **Step 2: Write `packages/web/src/online/api.ts`**

```ts
import { PROTOCOL_VERSION, type RoomInfo, type Settings, type TurnTimer } from '@ludo/engine'

export async function createRoom(body: { device: string; name: string; settings: Settings; timer: TurnTimer }): Promise<string> {
  const res = await fetch('/api/rooms', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  if (!res.ok) throw new Error(res.status === 429 ? 'too_fast' : 'failed')
  return ((await res.json()) as { code: string }).code
}

/** The room, or undefined when there's no room with that code. */
export async function roomInfo(code: string): Promise<RoomInfo | undefined> {
  const res = await fetch(`/api/rooms/${code}`)
  if (res.status === 404) return undefined
  if (!res.ok) throw new Error('failed')
  return (await res.json()) as RoomInfo
}

export const socketUrl = (code: string, device: string, name: string): string =>
  `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/rooms/${code}/socket?${new URLSearchParams({ device, name, v: String(PROTOCOL_VERSION) })}`
```

- [ ] **Step 3: Write the failing socket test** `packages/web/src/online/socket.test.ts`

```ts
import { afterEach, describe, expect, it, vi } from 'vitest'
import { openConnection, type SocketLike } from './socket'

class FakeSocket implements SocketLike {
  static made: FakeSocket[] = []
  readyState = 0
  sent: string[] = []
  onopen: (() => void) | null = null
  onmessage: ((e: { data: string }) => void) | null = null
  onclose: (() => void) | null = null
  constructor() {
    FakeSocket.made.push(this)
  }
  send(data: string) {
    this.sent.push(data)
  }
  close() {
    this.readyState = 3
    this.onclose?.()
  }
  open() {
    this.readyState = 1
    this.onopen?.()
  }
}

describe('openConnection', () => {
  afterEach(() => {
    vi.useRealTimers()
    FakeSocket.made = []
  })

  it('passes messages both ways once open', () => {
    const onMessage = vi.fn()
    const conn = openConnection({ url: 'ws://x', onMessage, onStatus: vi.fn(), create: () => new FakeSocket() })
    const socket = FakeSocket.made[0]
    expect(conn.send({ t: 'roll' })).toBe(false) // not open yet
    socket.open()
    expect(conn.send({ t: 'roll' })).toBe(true)
    expect(socket.sent).toEqual(['{"t":"roll"}'])
    socket.onmessage?.({ data: '{"t":"error","code":"illegal"}' })
    expect(onMessage).toHaveBeenCalledWith({ t: 'error', code: 'illegal' })
  })

  it('reconnects with a growing wait, and stops for good on close()', () => {
    vi.useFakeTimers()
    const onStatus = vi.fn()
    const conn = openConnection({ url: 'ws://x', onMessage: vi.fn(), onStatus, create: () => new FakeSocket() })
    FakeSocket.made[0].close()
    expect(onStatus).toHaveBeenLastCalledWith('reconnecting')
    vi.advanceTimersByTime(499)
    expect(FakeSocket.made).toHaveLength(1)
    vi.advanceTimersByTime(1)
    expect(FakeSocket.made).toHaveLength(2)
    FakeSocket.made[1].close()
    vi.advanceTimersByTime(999)
    expect(FakeSocket.made).toHaveLength(2)
    vi.advanceTimersByTime(1)
    expect(FakeSocket.made).toHaveLength(3)
    conn.close()
    vi.advanceTimersByTime(10_000)
    expect(FakeSocket.made).toHaveLength(3)
    expect(onStatus).toHaveBeenLastCalledWith('closed')
  })
})
```

- [ ] **Step 4: Write `packages/web/src/online/socket.ts`**

```ts
import type { ClientMessage, ServerMessage } from '@ludo/engine'

export type SocketLike = {
  readyState: number
  send(data: string): void
  close(): void
  onopen: (() => void) | null
  onmessage: ((e: { data: string }) => void) | null
  onclose: (() => void) | null
}

export type Status = 'connecting' | 'open' | 'reconnecting' | 'closed'
export type Connection = { send(msg: ClientMessage): boolean; close(): void }

const FIRST_WAIT = 500
const LONGEST_WAIT = 8000

/** A socket to the room that reconnects by itself, until `close()`. `send` is false while it's down. */
export function openConnection(o: {
  url: string
  onMessage: (msg: ServerMessage) => void
  onStatus: (status: Status) => void
  create?: (url: string) => SocketLike
}): Connection {
  const create = o.create ?? ((url: string) => new WebSocket(url) as unknown as SocketLike)
  let socket: SocketLike
  let wait = FIRST_WAIT
  let closed = false
  let timer: ReturnType<typeof setTimeout> | undefined

  function open() {
    socket = create(o.url)
    socket.onopen = () => {
      wait = FIRST_WAIT
      o.onStatus('open')
    }
    socket.onmessage = (e) => o.onMessage(JSON.parse(e.data) as ServerMessage)
    socket.onclose = () => {
      if (closed) return
      o.onStatus('reconnecting')
      timer = setTimeout(open, wait)
      wait = Math.min(wait * 2, LONGEST_WAIT)
    }
  }

  o.onStatus('connecting')
  open()
  return {
    send(msg) {
      if (socket.readyState !== 1) return false
      socket.send(JSON.stringify(msg))
      return true
    },
    close() {
      closed = true
      clearTimeout(timer)
      socket.close()
      o.onStatus('closed')
    },
  }
}
```

- [ ] **Step 5: Write the failing hook test** `packages/web/src/online/useOnlineGame.test.ts`

```ts
import { createGame, settingsFor, type RoomView, type ServerMessage } from '@ludo/engine'
import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { FAST_TIMING } from '../useGame'
import { useOnlineGame } from './useOnlineGame'

const settings = settingsFor('classic', 2, 'firstWins')
const roomView = (over: Partial<RoomView> = {}): RoomView => ({
  code: 'KQZM',
  phase: 'playing',
  host: 1,
  settings,
  timer: 'normal',
  members: [
    { id: 1, name: 'Ama', connected: true, seat: 'red' },
    { id: 2, name: 'Kofi', connected: true, seat: 'yellow' },
  ],
  computers: [],
  covering: [],
  paused: false,
  log: [],
  seq: 0,
  ...over,
})

function setup() {
  let deliver: (msg: ServerMessage) => void = () => {}
  const send = vi.fn(() => true)
  const connect = vi.fn((o: { onMessage: (m: ServerMessage) => void; onStatus: (s: 'open') => void }) => {
    deliver = o.onMessage
    o.onStatus('open')
    return { send, close: vi.fn() }
  })
  const hook = renderHook(() => useOnlineGame({ code: 'KQZM', device: 'd1', name: 'Ama', timing: FAST_TIMING, connect }))
  const push = (msg: ServerMessage) => act(() => deliver(msg))
  return { ...hook, push, send }
}

describe('useOnlineGame', () => {
  it('builds the board from the room and lets you act on your seat', () => {
    const { result, push, send } = setup()
    push({ t: 'room', room: roomView(), you: { id: 1, seat: 'red', host: true } })
    expect(result.current.humanToRoll).toBe(true)
    act(() => result.current.roll())
    expect(send).toHaveBeenCalledWith({ t: 'roll' })
    expect(result.current.humanToRoll).toBe(false) // waiting for the room to answer
  })

  it('plays events in sequence, and asks for a sync on a gap', () => {
    const { result, push, send } = setup()
    push({ t: 'room', room: roomView(), you: { id: 1, seat: 'red', host: true } })
    push({ t: 'event', seq: 1, event: { type: 'roll', value: 3 }, by: 'human' })
    expect(result.current.game.log).toEqual([{ type: 'roll', value: 3 }])
    push({ t: 'event', seq: 3, event: { type: 'roll', value: 2 }, by: 'computer' })
    expect(send).toHaveBeenCalledWith({ t: 'sync' })
    expect(result.current.game.log).toHaveLength(1)
  })

  it('a resync rebuilds the board from the log', () => {
    const { result, push } = setup()
    const log = [{ type: 'roll' as const, value: 3 }]
    push({ t: 'room', room: roomView({ log, seq: 1 }), you: { id: 2, seat: 'yellow', host: false } })
    expect(result.current.game.log).toEqual(log)
    expect(result.current.game.turn).toBe('yellow')
  })

  it('your covered seat is not yours to play until the room says so', () => {
    const { result, push } = setup()
    push({ t: 'room', room: roomView({ covering: ['red'] }), you: { id: 1, seat: 'red', host: true } })
    expect(result.current.humanToRoll).toBe(false)
  })

  it('stops for good on errors that end the connection', () => {
    const { result, push } = setup()
    push({ t: 'error', code: 'old_version' })
    expect(result.current.error).toBe('old_version')
  })

  it('a watcher controls nothing', () => {
    const { result, push } = setup()
    push({ t: 'room', room: roomView(), you: { id: 3, host: false } })
    expect(result.current.watching).toBe(true)
    expect(result.current.humanToRoll).toBe(false)
  })

  it('a lobby room keeps a fresh board with its settings', () => {
    const { result, push } = setup()
    push({ t: 'room', room: roomView({ phase: 'lobby', settings: settingsFor('ghana', 4, 'firstWins') }), you: { id: 1, host: true } })
    expect(result.current.game.players).toHaveLength(createGame(settingsFor('ghana', 4, 'firstWins')).players.length)
  })
})
```

- [ ] **Step 6: Write `packages/web/src/online/useOnlineGame.ts`**

```ts
import { createGame, replay, settingsFor, type ClientMessage, type Color, type ErrorCode, type Reaction, type RoomView, type ServerMessage, type Timing, type YouView } from '@ludo/engine'
import { useEffect, useRef, useState } from 'react'
import { useGameView } from '../useGameView'
import { socketUrl } from './api'
import { openConnection, type Connection, type Status } from './socket'

export type Clock = { deadline?: number; paused: boolean; pausedFor?: Color; covering: Color[] }
export type ShownReaction = { id: number; color: Color; reaction: Reaction }

/** Errors after which there's no point reconnecting. */
const FINAL: ErrorCode[] = ['not_found', 'old_version', 'replaced']
const REACTION_MS = 2000

export type OnlineOptions = {
  code: string
  device: string
  name: string
  timing: Timing
  connect?: typeof openConnection
}

/** A game in an online room: the room plays it, this device shows it and sends what its person does. */
export function useOnlineGame({ code, device, name, timing, connect = openConnection }: OnlineOptions) {
  const [room, setRoom] = useState<RoomView>()
  const [you, setYou] = useState<YouView>()
  const [status, setStatus] = useState<Status>('connecting')
  const [error, setError] = useState<ErrorCode>()
  const [clock, setClock] = useState<Clock>({ paused: false, covering: [] })
  const [reactions, setReactions] = useState<ShownReaction[]>([])
  // Sent an action, no answer yet: nothing more to send until there is.
  const [waiting, setWaiting] = useState(false)
  const seq = useRef(0)
  const conn = useRef<Connection>()
  const reactionId = useRef(0)
  const seat = you?.seat

  const view = useGameView({
    initial: createGame(settingsFor('ghana', 4, 'firstWins')),
    timing,
    you: seat,
    controls: (color) => color === seat && !waiting && !clock.paused && !clock.covering.includes(color),
    act: (intent) => {
      if (conn.current?.send(intent)) setWaiting(true)
    },
  })

  const clockFrom = (deadlineIn: number | undefined, rest: Omit<Clock, 'deadline'>): Clock => ({
    ...rest,
    deadline: deadlineIn === undefined ? undefined : Date.now() + deadlineIn,
  })

  function handle(msg: ServerMessage) {
    switch (msg.t) {
      case 'room': {
        const r = msg.room
        setRoom(r)
        setYou(msg.you)
        setWaiting(false)
        setClock(clockFrom(r.deadlineIn, { paused: r.paused, pausedFor: r.pausedFor, covering: r.covering }))
        if (r.phase === 'lobby') {
          seq.current = r.seq
          view.reset(createGame(r.settings))
        } else if (r.seq !== seq.current) {
          seq.current = r.seq
          view.reset(replay(r.settings, r.log))
        }
        return
      }
      case 'event':
        if (msg.seq !== seq.current + 1) {
          conn.current?.send({ t: 'sync' })
          return
        }
        seq.current = msg.seq
        setWaiting(false)
        view.enqueue(msg.event)
        return
      case 'clock':
        setClock(clockFrom(msg.deadlineIn, { paused: msg.paused, pausedFor: msg.pausedFor, covering: msg.covering }))
        return
      case 'reaction': {
        const id = ++reactionId.current
        setReactions((all) => [...all, { id, color: msg.color, reaction: msg.id }])
        setTimeout(() => setReactions((all) => all.filter((r) => r.id !== id)), REACTION_MS)
        return
      }
      case 'error':
        setWaiting(false)
        if (FINAL.includes(msg.code)) {
          setError(msg.code)
          conn.current?.close()
        }
        return
    }
  }
  // The socket is opened once; its messages always reach the latest handler.
  const handler = useRef(handle)
  handler.current = handle

  useEffect(() => {
    const c = connect({ url: socketUrl(code, device, name), onMessage: (m) => handler.current(m), onStatus: setStatus })
    conn.current = c
    return () => c.close()
  }, [code, device])

  const send = (msg: ClientMessage) => conn.current?.send(msg) ?? false

  return { ...view, room, you, status, error, clock, reactions, send, watching: you !== undefined && !you.seat }
}
```

- [ ] **Step 7: Run the tests:** `npm test -w @ludo/web && npm run typecheck -w @ludo/web`. Expected: all pass.

- [ ] **Step 8: Commit**

```bash
git add packages/web/src
git commit -m "feat(web): device identity, room API, reconnecting socket and useOnlineGame"
```

```json:metadata
{"files": ["packages/web/src/online/api.ts", "packages/web/src/online/socket.ts", "packages/web/src/online/useOnlineGame.ts", "packages/web/src/online/socket.test.ts", "packages/web/src/online/useOnlineGame.test.ts", "packages/web/src/storage.ts", "packages/web/src/storage.test.ts"], "verifyCommand": "npm test -w @ludo/web", "acceptanceCriteria": ["device ID and nickname kept", "socket reconnects with backoff, close stops it", "room/event/clock/reaction/error handled as specified", "own seat controlled only when not covered, paused or waiting"], "requiresUserVerification": false}
```

---

### Task 10: Web: Play online, create, join, lobby and room links

**Goal:** People get from the home screen into a room by creating one, typing a code or opening a link, then sit, share and start.

**Files:**
- Create: `packages/web/src/online/PlayOnline.tsx`, `packages/web/src/online/Lobby.tsx`, `packages/web/src/online/RoomScreen.tsx`, plus a test file for each.
- Modify:
  - `packages/web/src/screens/Home.tsx`: a "Play online" button.
  - `packages/web/src/screens/Setup.tsx`: an online mode.
  - `packages/web/src/App.tsx`: screens and `/r/CODE`.
  - `packages/web/src/update.ts`: `updateNow`.
  - `packages/web/src/styles.css`.
  - Tests: `Home.test.tsx`, `Setup.test.tsx`, `App.test.tsx`.

**Acceptance Criteria:**
- [ ] **Home:** shows **Play online**.
- [ ] **Play online:** a nickname field (required, saved), **Create a room**, and a 4-letter code field with **Join**. The code is uppercased, and Join is disabled until there are 4 letters.
- [ ] **Setup online mode:**
  - It has no seat rows, and adds a **Turn timer** picker: Relaxed / Normal / Quick / No timer, each with a description.
  - Its button reads **Create room**, and is **Save** when editing an existing room's settings.
  - It calls `onCreate(settings, timer)`.
- [ ] **Creating:** calls the API and opens the room. A 429 shows "Too many new rooms. Try again in a minute."
- [ ] **Room links:**
  - `/r/CODE` opens that room. Without a nickname, Play online comes first, with the code filled in.
  - The address bar shows `/r/CODE` while in a room, and `/` after leaving.
- [ ] **Lobby:**
  - The big code and **Share link**: `navigator.share`, or copy plus "Link copied".
  - A row per seat of the player count: "Red: Kofi (host)", "Tap to sit" or "Stand up".
  - "N watching".
  - Host: a **Settings** row (opens Setup online mode prefilled, and sends `settings`) and **Start**. When seats are empty, Start asks **Fill with computers** or **Play with N** in a sheet, where "Play with N" needs 2+.
  - Others see "Waiting for <host> to start".
- [ ] **Room errors:** "No room with that code" or "This room has ended" with **Home**. "Opened in another tab" for `replaced`. `old_version` calls `updateNow()`.
- [ ] **Updates:** an online room counts as "in a game", so app updates wait for it.

**Verify:** `npm test -w @ludo/web` → all pass.

**Steps:**

- [ ] **Step 1: `update.ts`.** Add a forced update for the room's `old_version`:

```ts
/** The room needs a newer app: switch now, game or not. */
export function updateNow(): void {
  if (apply) apply()
  else location.reload()
}
```

With a test: `updateReady(reload)` while playing, then `updateNow()` → `reload` is called.

- [ ] **Step 2: Setup online mode.** In `Setup.tsx`, add these props:

```ts
type Props = {
  // …existing props…
  /** Online: no seats (they fill as people join), a turn timer, and `onCreate` instead of `onStart`. */
  online?: { initial?: { settings: Settings; timer: TurnTimer }; submitLabel: string; onCreate: (settings: Settings, timer: TurnTimer) => void }
}
const TIMERS = [
  ['relaxed', 'Relaxed', '60 seconds for each roll or move.'],
  ['normal', 'Normal', '30 seconds for each roll or move.'],
  ['quick', 'Quick', '15 seconds for each roll or move.'],
  ['off', 'No timer', 'Take as long as you like. The computer only steps in if someone leaves.'],
] as const
```

- **Initial state:** when `online.initial` is set, the `rules`, `afterKick`, `players`, `endCondition` and `mode` (`modeOf(rules) ?? 'ghana'`) states start from it.
- **Players section:** in online mode it shows only the Players picker row, not the seat rows.
- **Timer row:** add a `timer` state (default `'normal'`) and a `'timer'` value in `Open`. A `pickerRow('timer', 'Turn timer', labelOf(TIMERS, timer))` goes after "Game ends", with its `Picker`.
- **Title:** `online ? 'New room' : 'New game'`.
- **Submit button:** its text is `online?.submitLabel ?? 'Start game'`, and it calls `online ? online.onCreate({ players, endCondition, rules, afterKick }, timer) : start()`.

Tests in `Setup.test.tsx`:

```tsx
it('online: no seat rows, a turn timer, and Create room hands back the settings and timer', async () => {
  const onCreate = vi.fn()
  render(<Setup onStart={vi.fn()} onBack={vi.fn()} hand="right" onHand={vi.fn()} theme="system" onTheme={vi.fn()} online={{ submitLabel: 'Create room', onCreate }} />)
  expect(screen.queryByRole('button', { name: /Red player/ })).toBeNull()
  await userEvent.click(screen.getByRole('button', { name: /Turn timer/ }))
  await userEvent.click(screen.getByRole('radio', { name: 'Quick' }))
  await userEvent.click(screen.getByRole('button', { name: 'Create room' }))
  expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({ players: 4 }), 'quick')
})
```

- [ ] **Step 3: `PlayOnline.tsx`**

```tsx
import { useState } from 'react'

type Props = { name: string; code?: string; onName: (name: string) => void; onCreate: () => void; onJoin: (code: string) => void; onBack: () => void }

/** Your nickname, then make a room or join one by its code. */
export function PlayOnline({ name: savedName, code: givenCode = '', onName, onCreate, onJoin, onBack }: Props) {
  const [name, setName] = useState(savedName)
  const [code, setCode] = useState(givenCode)
  const clean = name.trim()
  const ready = clean.length > 0
  const keep = () => onName(clean)
  return (
    <main className="screen online">
      <header className="setup-head">
        <button type="button" className="icon-button" aria-label="Back" onClick={onBack}>
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 4l-6 6 6 6" />
          </svg>
        </button>
        <h1>Play online</h1>
      </header>
      <label className="field">
        <span className="field-label">Your name</span>
        <input value={name} maxLength={16} autoComplete="nickname" onChange={(e) => setName(e.target.value)} onBlur={() => ready && keep()} />
      </label>
      <button type="button" className="primary" disabled={!ready} onClick={() => (keep(), onCreate())}>
        Create a room
      </button>
      <form
        className="join"
        onSubmit={(e) => {
          e.preventDefault()
          keep()
          onJoin(code)
        }}
      >
        <label className="field">
          <span className="field-label">Room code</span>
          <input
            value={code}
            inputMode="text"
            autoCapitalize="characters"
            maxLength={4}
            onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z]/g, ''))}
          />
        </label>
        <button type="submit" className="secondary" disabled={!ready || code.length !== 4}>
          Join
        </button>
      </form>
    </main>
  )
}
```

Tests: the buttons are disabled without a name; the code is uppercased and letters only; Join hands back the code and saves the name.

- [ ] **Step 4: `Lobby.tsx`**

```tsx
import { SEATS, type ClientMessage, type RoomView, type YouView } from '@ludo/engine'
import { useState } from 'react'
import { Sheet } from '../components/Sheet'
import { COLOR_NAME, rulesName } from '../labels'
import { COLOR_HEX } from '../theme'

type Props = { room: RoomView; you: YouView; send: (msg: ClientMessage) => void; onSettings: () => void; onLeave: () => void }

const roomLink = (code: string) => `${location.origin}/r/${code}`

export function Lobby({ room, you, send, onSettings, onLeave }: Props) {
  const [asking, setAsking] = useState(false)
  const [copied, setCopied] = useState(false)
  const seats = SEATS[room.settings.players]
  const sitter = (color: string) => room.members.find((m) => m.seat === color)
  const people = room.members.filter((m) => m.seat).length
  const watching = room.members.filter((m) => !m.seat && m.connected).length
  const host = room.members.find((m) => m.id === room.host)

  async function share() {
    const url = roomLink(room.code)
    if (navigator.share) {
      await navigator.share({ title: 'Ludo Unlimited', text: `Join my Ludo game: ${room.code}`, url }).catch(() => {})
    } else {
      await navigator.clipboard.writeText(url)
      setCopied(true)
    }
  }

  function start() {
    if (people === seats.length) send({ t: 'start', empty: 'computers' })
    else setAsking(true)
  }

  return (
    <main className="screen lobby">
      <p className="room-code-label">Room code</p>
      <p className="room-code">{room.code}</p>
      <button type="button" className="secondary" onClick={share}>
        {copied ? 'Link copied' : 'Share link'}
      </button>

      <section aria-labelledby="seats-heading">
        <h2 id="seats-heading" className="section-heading">
          Players
        </h2>
        {seats.map((color) => {
          const m = sitter(color)
          const mine = m?.id === you.id
          return (
            <div key={color} className="row">
              <span className="dot" style={{ background: COLOR_HEX[color] }} />
              <span className="row-label">{m ? `${m.name}${m.id === room.host ? ' (host)' : ''}` : COLOR_NAME[color]}</span>
              {mine ? (
                <button type="button" className="seat-button" onClick={() => send({ t: 'stand' })}>
                  Stand up
                </button>
              ) : !m && !you.seat ? (
                <button type="button" className="seat-button human" onClick={() => send({ t: 'sit', color })}>
                  Tap to sit
                </button>
              ) : null}
            </div>
          )
        })}
        {watching > 0 && <p className="row-note">{watching} watching</p>}
      </section>

      <section aria-labelledby="rules-heading">
        <h2 id="rules-heading" className="section-heading">
          Rules
        </h2>
        {you.host ? (
          <button type="button" className="row" onClick={onSettings}>
            <span className="row-label">Settings</span>
            <span className="row-value">{rulesName(room.settings.rules)}</span>
          </button>
        ) : (
          <p className="row">
            <span className="row-label">{rulesName(room.settings.rules)}</span>
          </p>
        )}
      </section>

      {you.host ? (
        <button type="button" className="primary start" disabled={people < 1} onClick={start}>
          Start
        </button>
      ) : (
        <p className="hint">Waiting for {host?.name ?? 'the host'} to start</p>
      )}
      <button type="button" className="secondary" onClick={onLeave}>
        Leave room
      </button>

      {asking && (
        <Sheet title={`${seats.length - people} empty ${seats.length - people === 1 ? 'seat' : 'seats'}`} onClose={() => setAsking(false)}>
          <div className="sheet-rows">
            <button type="button" className="sheet-row" onClick={() => (setAsking(false), send({ t: 'start', empty: 'computers' }))}>
              Fill with computers
            </button>
            {people >= 2 && (
              <button type="button" className="sheet-row" onClick={() => (setAsking(false), send({ t: 'start', empty: 'drop' }))}>
                Play with {people}
              </button>
            )}
          </div>
        </Sheet>
      )}
    </main>
  )
}
```

Tests (`Lobby.test.tsx`) cover:
- Seats show names and "(host)".
- "Tap to sit" sends `sit`, and your own seat offers "Stand up".
- A non-host sees "Waiting for Ama to start".
- The host's Start with empty seats opens the sheet. "Play with N" appears only with 2+ seated, and each choice sends `start`.
- Share falls back to copying, and "Link copied" shows. Stub `navigator.clipboard`.

- [ ] **Step 5: `RoomScreen.tsx`.** It owns the connection and picks what to show by phase:

```tsx
import { useState, type ComponentProps } from 'react'
import { Setup } from '../screens/Setup'
import { updateNow } from '../update'
import type { Timing } from '../useGame'
import { Lobby } from './Lobby'
import { useOnlineGame } from './useOnlineGame'
import { OnlineGame } from './OnlineGame' // Task 11

type Props = {
  code: string
  device: string
  name: string
  timing: Timing
  onLeave: () => void
  /** Device preferences, passed through to the game and settings screens. */
  device_prefs: Omit<ComponentProps<typeof OnlineGame>, 'online' | 'onLeave'> & Pick<ComponentProps<typeof Setup>, 'hand' | 'onHand' | 'theme' | 'onTheme'>
}

export function RoomScreen({ code, device, name, timing, onLeave, device_prefs }: Props) {
  const online = useOnlineGame({ code, device, name, timing })
  const [editing, setEditing] = useState(false)
  const { room, you, error } = online

  if (error === 'old_version') {
    updateNow()
    return <Message text="Updating to keep playing…" />
  }
  if (error === 'not_found') return <Message text={room ? 'This room has ended' : 'No room with that code'} onHome={onLeave} />
  if (error === 'replaced') return <Message text="This room is open in another tab" onHome={onLeave} />
  if (!room || !you) return <Message text="Connecting…" />

  if (room.phase === 'lobby') {
    if (editing && you.host) {
      return (
        <Setup
          {...device_prefs}
          onBack={() => setEditing(false)}
          onStart={() => {}}
          online={{
            initial: { settings: room.settings, timer: room.timer },
            submitLabel: 'Save',
            onCreate: (settings, timer) => {
              online.send({ t: 'settings', settings, timer })
              setEditing(false)
            },
          }}
        />
      )
    }
    return <Lobby room={room} you={you} send={online.send} onSettings={() => setEditing(true)} onLeave={onLeave} />
  }
  return <OnlineGame {...device_prefs} online={online} onLeave={onLeave} />
}

function Message({ text, onHome }: { text: string; onHome?: () => void }) {
  return (
    <main className="screen message">
      <p>{text}</p>
      {onHome && (
        <button type="button" className="primary" onClick={onHome}>
          Home
        </button>
      )}
    </main>
  )
}
```

> `OnlineGame` comes in Task 11. For this task, create a stub `online/OnlineGame.tsx` that renders `<p>Game in progress</p>` with the same props type, so this compiles and the lobby can be tested. Rename the prop `device_prefs` to `prefs` if lint complains.

Tests (`RoomScreen.test.tsx`) mock `./useOnlineGame` with `vi.mock` and check each branch: connecting, the not-found wording before and after a room was seen, the lobby, settings editing, and `old_version` calling `updateNow`. Mock `../update` for that one.

- [ ] **Step 6: Home and App**
  - **Home:** add a `onOnline` prop and a third button, **Play online**, rendered as `className="secondary"` after New game and Continue.
  - **App:** add these screens to the `Screen` union:

```ts
  | { name: 'online'; code?: string }
  | { name: 'create' }
  | { name: 'room'; code: string }
```

- **Start screen:** from the address, `const linked = location.pathname.match(/^\/r\/([A-Za-z]{4})$/)?.[1]?.toUpperCase()`. The initial screen is `linked ? (loadName() ? { name: 'room', code: linked } : { name: 'online', code: linked }) : { name: 'home' }`.
- **Device and name:** `const [device] = useState(loadDevice)` and `const [name, setName] = useState(loadName)`. `changeName` saves it.
- **Address bar:** `useEffect(() => history.replaceState(null, '', screen.name === 'room' ? `/r/${screen.code}` : '/'), [screen])`.
- **Updates:** `useEffect(() => setPlaying(screen.name === 'game' || screen.name === 'room'), [screen.name])`. This replaces the Task-0 line.
- **Screens:**
  - `online` renders `PlayOnline`, which goes to `create` or `room`.
  - `create` renders `Setup` with `online={{ submitLabel: 'Create room', onCreate }}`. `onCreate` calls `createRoom({ device, name, settings, timer })`, then sets the screen to `room`. On a `too_fast` error it shows `alert('Too many new rooms. Try again in a minute.')`; use a simple inline error `<p role="alert">` if you prefer.
  - `room` renders `RoomScreen` with `onLeave={goHome}`.
- **Tests (`App.test.tsx`):** Play online → type a name → Join with a code → the room screen. Mock `./online/useOnlineGame` to return a lobby. Also test that `/r/ABCD` opens that room when a name is saved (set `localStorage` and `history.pushState` before render).

- [ ] **Step 7: Styles.** Add to `styles.css`, using the existing tokens:

```css
.field { display: flex; flex-direction: column; gap: 6px; margin: 16px 0; }
.field-label { font-weight: 800; font-size: 15px; color: var(--muted); }
.field input { min-height: 48px; padding: 0 14px; border: 1px solid var(--line); border-radius: 12px; background: transparent; color: var(--text); font: inherit; font-size: 18px; }
.join { display: flex; align-items: flex-end; gap: 12px; }
.join .field { flex: 1; }
.room-code-label { margin: 24px 0 0; font-weight: 800; font-size: 15px; color: var(--muted); }
.room-code { margin: 0 0 12px; font-weight: 900; font-size: 56px; letter-spacing: 6px; }
.message { align-items: center; justify-content: center; min-height: 60vh; gap: 16px; text-align: center; }
```

- [ ] **Step 8: Run the tests and look at the screens.** Run `npm test -w @ludo/web && npm run typecheck -w @ludo/web`. Then start both servers (`npm run dev -w @ludo/server` and `npm run dev -w @ludo/web`). Open http://localhost:5173 at phone size and check: create a room, open its link in a second window, sit in both, start.

- [ ] **Step 9: Commit**

```bash
git add packages/web/src
git commit -m "feat(web): play online: nickname, create and join rooms, lobby, room links"
```

```json:metadata
{"files": ["packages/web/src/online/PlayOnline.tsx", "packages/web/src/online/Lobby.tsx", "packages/web/src/online/RoomScreen.tsx", "packages/web/src/online/OnlineGame.tsx", "packages/web/src/screens/Home.tsx", "packages/web/src/screens/Setup.tsx", "packages/web/src/App.tsx", "packages/web/src/update.ts", "packages/web/src/styles.css"], "verifyCommand": "npm test -w @ludo/web", "acceptanceCriteria": ["Play online with nickname, create, join by code", "Setup online mode with turn timer", "lobby seats, share, host settings and start sheet", "room links and address bar", "error screens; old_version forces update", "online room counts as playing for updates"], "requiresUserVerification": false}
```

---

### Task 11: Web: the online game screen

**Goal:** The game itself online, with the existing board plus names and away players, the turn clock, reactions, the host's pause, watching, connection state, leaving, and rematch.

**Files:**
- Create: `packages/web/src/online/OnlineGame.tsx` (replacing the Task 10 stub), `packages/web/src/online/TurnClock.tsx`, `packages/web/src/online/Reactions.tsx`, `packages/web/src/online/OnlineResults.tsx`, plus a test file for each.
- Modify:
  - `packages/web/src/screens/GameView.tsx`: an `extra` slot and an optional `turnText`.
  - `packages/web/src/components/Board.tsx`: an `away` prop.
  - `packages/web/src/labels.ts`: `turnTag` with names.
  - `packages/web/src/styles.css`.

**Acceptance Criteria:**
- [ ] Yards show nicknames, with "(away)" for disconnected players and "Computer" for computer seats.
- [ ] The turn label names the player: "Your turn" or "Kofi's turn". Watchers see "Watching" above the dice.
- [ ] A thin ring round the dice drains while a person has the clock, and turns the warning colour in the last 10 s. There's no ring with no timer, when paused, or when the computer acts.
- [ ] Reactions:
  - A reaction button opens 6 presets. Picking one sends `react` and closes the tray.
  - Every reaction pops over its sender's yard (turned with the board) for 2 s.
  - Watchers don't get the button.
- [ ] Host notices:
  - While a seat is covered because its player left, the host sees "Kofi left. A computer is playing for them", with **Pause and wait**, which sends `pause` with `for`.
  - While paused, everyone sees "Paused, waiting for Kofi" (or just "Paused"), and the host gets **Carry on**.
- [ ] While the socket is down, a small "Reconnecting…" note shows.
- [ ] The menu's quit row reads **Leave room**, and there's no Restart.
- [ ] Results:
  - Online results list the places with the players' names.
  - The host gets **Rematch** (sends `rematch`), and everyone gets **Leave**. Non-hosts see "Waiting for <host>".
  - Rematch brings everyone back to the lobby, because the room message's phase drives `RoomScreen`.

**Verify:** `npm test -w @ludo/web` → all pass.

**Steps:**

- [ ] **Step 1: Board `away`.** In `Board.tsx`, add the prop `away?: Color[]`. Where the yard name is drawn, append ` (away)` to the text for colours in `away`. Test in `Board.test.tsx`: `names={{ red: 'Kofi' }} away={['red']}` → the text "Kofi (away)" is present.

- [ ] **Step 2: `GameView` extension points.** Add these optional props to `GameViewProps`:

```ts
  /** Online extras drawn over the board (reactions) and above the controls (notices). */
  overlay?: ReactNode
  notice?: ReactNode
  /** Drawn round the dice (the turn clock). */
  diceRing?: ReactNode
  /** Replaces the turn label's text (e.g. "Kofi's turn", "Watching"). */
  turnText?: string
  /** Shown in the controls in place of the dice hint (the reactions button). */
  side?: ReactNode
  /** Names for the turn label ("Kofi's turn"); the local game leaves it out and keeps colour names. */
  turnNames?: Partial<Record<Color, string>>
  /** Seats whose player has disconnected, marked on their yard. */
  away?: Color[]
```

- **`overlay`:** rendered inside `<Board>` after `BoardFx`.
- **`notice`:** rendered right after `</header>`.
- **`diceRing`:** goes inside `.dice-slot`, before `DiceButton`.
- **`turnText ?? turnTag(mover, you)`:** in the turn label.
- **`side`:** goes after the action slot.
- **Existing tests:** they keep passing, because every new prop is optional.

- [ ] **Step 3: `TurnClock.tsx`**

```tsx
import { useEffect, useState } from 'react'

const WARN_MS = 10_000

/** A ring round the dice that drains until `deadline`; it turns the warning colour for the last 10 seconds. */
export function TurnClock({ deadline, total }: { deadline: number; total: number }) {
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(id)
  }, [deadline])
  const left = Math.max(0, deadline - now)
  const share = Math.min(1, left / total)
  return (
    <svg className={`turn-clock${left < WARN_MS ? ' warn' : ''}`} viewBox="0 0 100 100" aria-label={`${Math.ceil(left / 1000)} seconds left`} role="img">
      <circle cx="50" cy="50" r="46" pathLength="1" strokeDasharray={`${share} 1`} />
    </svg>
  )
}
```

CSS:

```css
.dice-slot { position: relative; }
.turn-clock { position: absolute; inset: -8px; width: calc(100% + 16px); height: calc(100% + 16px); transform: rotate(-90deg); pointer-events: none; }
.turn-clock circle { fill: none; stroke: var(--button-bg); stroke-width: 4; stroke-linecap: round; transition: stroke-dasharray 0.25s linear; }
.turn-clock.warn circle { stroke: #FF3B30; }
```

> Check where the ring sits against the real `.dice-slot` layout, which includes the turn label. If it rings the whole slot, wrap `DiceButton` and the ring in a `<span className="dice-wrap">` and position the ring on that instead.

Tests (fake timers): the label reads "30 seconds left" at the start, the `warn` class is added under 10 s, and the ring empties at the deadline.

- [ ] **Step 4: `Reactions.tsx`**

```tsx
import type { Color, Reaction } from '@ludo/engine'
import { useState } from 'react'
import { Sheet } from '../components/Sheet'
import { yardCentre } from '../fx/actions'
import { BOARD_SIZE, turnPoint } from '../layout'
import type { ShownReaction } from './useOnlineGame'

export const REACTION_TEXT: Record<Reaction, string> = { laugh: '😂', clap: '👏', shock: '😱', fire: '🔥', hurry: 'Hurry up', wicked: 'Wicked!' }

export function ReactionButton({ onReact }: { onReact: (id: Reaction) => void }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" className="secondary react-button" aria-haspopup="dialog" onClick={() => setOpen(true)}>
        React
      </button>
      {open && (
        <Sheet title="React" onClose={() => setOpen(false)}>
          <div className="reaction-grid">
            {(Object.keys(REACTION_TEXT) as Reaction[]).map((id) => (
              <button key={id} type="button" className="reaction-choice" onClick={() => (onReact(id), setOpen(false))}>
                {REACTION_TEXT[id]}
              </button>
            ))}
          </div>
        </Sheet>
      )}
    </>
  )
}

const pct = (v: number) => `${(v / BOARD_SIZE) * 100}%`

/** Each reaction pops over its sender's yard, wherever the board is turned. */
export function ReactionBubbles({ reactions, turn }: { reactions: ShownReaction[]; turn: number }) {
  return (
    <>
      {reactions.map((r) => {
        const { x, y } = turnPoint(yardCentre(r.color as Color), turn)
        return (
          <span key={r.id} className="reaction-bubble" style={{ left: pct(x), top: pct(y) }} role="status">
            {REACTION_TEXT[r.reaction]}
          </span>
        )
      })}
    </>
  )
}
```

> Check that `BOARD_SIZE` and `turnPoint` are exported from `layout.ts` (`Board.tsx` uses both). Export them if they're module-private.

CSS:

```css
.reaction-bubble { position: absolute; z-index: 4; transform: translate(-50%, -50%); padding: 8px 14px; border-radius: 999px; background: var(--table); box-shadow: 0 4px 16px rgba(0, 0, 0, 0.18); font-weight: 800; font-size: 22px; white-space: nowrap; pointer-events: none; animation: bubble 2s ease-out forwards; }
@keyframes bubble { 0% { opacity: 0; transform: translate(-50%, -30%) scale(0.8); } 12% { opacity: 1; transform: translate(-50%, -50%) scale(1); } 80% { opacity: 1; } 100% { opacity: 0; } }
.reaction-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; padding-bottom: 12px; }
.reaction-choice { min-height: 56px; border: 1px solid var(--line); border-radius: 14px; background: transparent; color: var(--text); font: inherit; font-weight: 800; font-size: 22px; }
@media (prefers-reduced-motion: reduce) { .reaction-bubble { animation: none; } }
```

Tests: picking 🔥 calls `onReact('fire')` and closes the sheet; a bubble shows its text.

- [ ] **Step 5: `OnlineGame.tsx`**

```tsx
import { SEATS, TIMER_SECONDS, type Color } from '@ludo/engine'
import { useState } from 'react'
import { COLOR_NAME } from '../labels'
import { quarterTurns } from '../layout'
import { GameView, type GameViewProps } from '../screens/GameView'
import type { useOnlineGame } from './useOnlineGame'
import { OnlineResults } from './OnlineResults'
import { ReactionBubbles, ReactionButton } from './Reactions'
import { TurnClock } from './TurnClock'

type Prefs = Pick<GameViewProps, 'hand' | 'onHand' | 'theme' | 'onTheme' | 'effectsLevel' | 'onEffectsLevel' | 'sound' | 'onSound' | 'music' | 'onMusic'>
type Props = Prefs & { online: ReturnType<typeof useOnlineGame>; onLeave: () => void }

export function OnlineGame({ online, onLeave, ...prefs }: Props) {
  const { room, you, clock, game } = online
  const [results, setResults] = useState(false)
  if (!room || !you) return null
  const colors = game.players.map((p) => p.color)
  const nameOf = (color: Color) => (room.computers.includes(color) ? 'Computer' : room.members.find((m) => m.seat === color)?.name ?? COLOR_NAME[color])
  const names = Object.fromEntries(colors.map((c) => [c, nameOf(c)])) as Partial<Record<Color, string>>
  const away = colors.filter((c) => room.members.some((m) => m.seat === c && !m.connected))
  const viewer = you.seat ?? SEATS[room.settings.players][0]
  const isHost = you.host
  const left = clock.covering.find((c) => away.includes(c))

  if (results) return <OnlineResults game={game} names={names} host={isHost} hostName={room.members.find((m) => m.id === room.host)?.name} onRematch={() => online.send({ t: 'rematch' })} onLeave={onLeave} />

  const notice = clock.paused ? (
    <div className="notice" role="status">
      <span>{clock.pausedFor ? `Paused, waiting for ${nameOf(clock.pausedFor)}` : 'Paused'}</span>
      {isHost && (
        <button type="button" className="primary" onClick={() => online.send({ t: 'resume' })}>
          Carry on
        </button>
      )}
    </div>
  ) : isHost && left ? (
    <div className="notice" role="status">
      <span>{nameOf(left)} left. A computer is playing for them</span>
      <button type="button" className="secondary" onClick={() => online.send({ t: 'pause', for: left })}>
        Pause and wait
      </button>
    </div>
  ) : online.status === 'reconnecting' ? (
    <div className="notice" role="status">
      <span>Reconnecting…</span>
    </div>
  ) : undefined

  const total = room.timer === 'off' ? 0 : TIMER_SECONDS[room.timer] * 1000
  const ring = clock.deadline !== undefined && total > 0 && !clock.paused ? <TurnClock deadline={clock.deadline} total={total} /> : undefined
  const turnText = online.watching ? 'Watching' : undefined

  return (
    <GameView
      {...prefs}
      g={online}
      viewer={viewer}
      you={you.seat}
      names={names}
      animated
      rules={room.settings.rules}
      quitLabel="Leave room"
      onQuit={onLeave}
      onFinish={() => setResults(true)}
      notice={notice}
      diceRing={ring}
      turnText={turnText}
      turnNames={names}
      overlay={<ReactionBubbles reactions={online.reactions} turn={quarterTurns(viewer, prefs.hand)} />}
      side={you.seat ? <ReactionButton onReact={(id) => online.send({ t: 'react', id })} /> : undefined}
      away={away}
    />
  )
}
```

Notes for implementing it:
- **`GameView` passes `away`** through to `Board`. Add `away?: Color[]` and `turnNames?: Partial<Record<Color, string>>` to `GameViewProps` too.
- **Rematch:** when the room goes back to the lobby, `RoomScreen` renders `Lobby` because the phase changed, and that unmounts this component, `results` state included.

- [ ] **Step 6: Names in the turn label.** In `labels.ts`, give `turnTag` an optional third parameter, `names?: Partial<Record<Color, string>>`. It returns `${names?.[color] ?? COLOR_NAME[color]}'s turn` for others. `GameView` calls `turnTag(mover, you, turnNames)`, and only `OnlineGame` passes `turnNames`, so the local game keeps "Yellow's turn". Test it in `labels.test.ts`.

- [ ] **Step 7: `OnlineResults.tsx`.** This is the existing `Results` layout, with names and a host-only Rematch:

```tsx
import type { Color, GameState } from '@ludo/engine'
import { ORDINAL } from '../labels'
import { COLOR_HEX } from '../theme'

type Props = { game: GameState; names: Partial<Record<Color, string>>; host: boolean; hostName?: string; onRematch: () => void; onLeave: () => void }

export function OnlineResults({ game, names, host, hostName, onRematch, onLeave }: Props) {
  const ranked = [...game.players].sort((a, b) => (a.finishedPlace ?? 99) - (b.finishedPlace ?? 99))
  return (
    <main className="screen results">
      <h1>Game over</h1>
      <ol>
        {ranked.map((p) => (
          <li key={p.color} className="row">
            <span className="dot" style={{ background: COLOR_HEX[p.color] }} />
            <span className="row-label">{names[p.color]}</span>
            {p.finishedPlace && <span className="row-value">{ORDINAL[p.finishedPlace - 1]}</span>}
          </li>
        ))}
      </ol>
      <div className="results-actions">
        {host ? (
          <button type="button" className="primary" onClick={onRematch}>
            Rematch
          </button>
        ) : (
          <p className="hint">Waiting for {hostName ?? 'the host'}</p>
        )}
        <button type="button" className="secondary" onClick={onLeave}>
          Leave
        </button>
      </div>
    </main>
  )
}
```

- [ ] **Step 8: Notice styles**

```css
.notice { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin: 0 16px 8px; padding: 10px 14px; border-radius: 14px; background: var(--tile, rgba(0, 0, 0, 0.05)); font-weight: 700; font-size: 15px; }
.notice button { min-height: 40px; padding: 0 14px; font-size: 15px; }
```

- [ ] **Step 9: Tests (`OnlineGame.test.tsx`).** Build an `online` object by hand: spread a `useGameView` result from `renderHook`, plus room fields. Check:
  - names and "(away)" on yards, and "Computer" on computer seats
  - "Watching" for a watcher
  - the host's left notice sends `pause` with `for`
  - the paused bar and Carry on (host only)
  - "Reconnecting…" while the status is `reconnecting`
  - the menu shows "Leave room" and no Restart
  - the results Rematch is for the host only

- [ ] **Step 10: Run the tests, and play it.** Run `npm test -w @ludo/web && npm run typecheck -w @ludo/web`. Then, with both dev servers running, play a few turns in two windows: check the clock, reactions, closing one window (the host notice), Pause and wait, reopening (it carries on), and finish a 2-player game to the rematch.

- [ ] **Step 11: Commit**

```bash
git add packages/web/src
git commit -m "feat(web): the online game: names, turn clock, reactions, host pause, watching, rematch"
```

```json:metadata
{"files": ["packages/web/src/online/OnlineGame.tsx", "packages/web/src/online/TurnClock.tsx", "packages/web/src/online/Reactions.tsx", "packages/web/src/online/OnlineResults.tsx", "packages/web/src/screens/GameView.tsx", "packages/web/src/components/Board.tsx", "packages/web/src/labels.ts", "packages/web/src/styles.css"], "verifyCommand": "npm test -w @ludo/web", "acceptanceCriteria": ["names, away, Computer on yards; names in turn label; Watching", "turn clock ring with warning", "reactions tray and bubbles", "host left notice and pause/carry on", "reconnecting note", "Leave room, no restart", "online results with host rematch"], "requiresUserVerification": false}
```

---

### Task 12: End-to-end test, CI, docs and the user's check

**Goal:** A two-browser test proves a room works end to end, CI runs it, the docs say how to deploy, and the user plays it for real.

**Files:**
- Create: `packages/web/e2e/online.spec.ts`
- Modify: `packages/web/playwright.config.ts`, `README.md` (or create a short one if there isn't any), `docs/superpowers/specs/2026-11-08-online-rooms-design.md` (the refinements listed at the top of this plan)

**Acceptance Criteria:**
- [ ] Playwright starts `wrangler dev` (port 8787) and Vite (port 5199) for the tests.
- [ ] `online.spec.ts`:
  - Host A creates a room, and B joins with the code. Both sit and the host starts.
  - Both see the same turn label and the dice.
  - B closes, and A sees the host notice. B comes back with the same storage and is a player again.
- [ ] CI runs it, with the existing e2e job.
- [ ] The README explains running the two dev servers and the Workers Builds deploy command change.
- [ ] The user confirms a real room works across two devices.

**Verify:** `npm run e2e -w @ludo/web` → all specs pass locally.

**Steps:**

- [ ] **Step 1: The Playwright config.** Start both servers:

```ts
  webServer: [
    {
      command: 'npm run dev -w @ludo/server -- --port 8787',
      url: 'http://localhost:8787/api/rooms/AAAA',
      reuseExistingServer: !process.env.CI,
      cwd: '../..',
    },
    {
      command: 'npm run dev -- --port 5199 --strictPort',
      url: 'http://localhost:5199',
      reuseExistingServer: !process.env.CI,
    },
  ],
```

> The first URL answers 404 JSON, and Playwright treats any HTTP answer below 400 as up. If it waits forever, point it at `http://localhost:8787/` instead, which the asset fallback serves with 200 once `packages/web/dist` exists. CI builds nothing before e2e, so prefer a request that works on an empty dist. `wrangler dev` runs locally and needs no Cloudflare login. If it asks for one in CI, add `--local` (or `CLOUDFLARE_ACCOUNT_ID`) to the command.

- [ ] **Step 2: Write `packages/web/e2e/online.spec.ts`**

```ts
import { expect, test } from '@playwright/test'

test('two people play in a room, and one leaves and comes back', async ({ browser }) => {
  const a = await (await browser.newContext()).newPage()
  const bContext = await browser.newContext()
  let b = await bContext.newPage()

  await a.goto('/')
  await a.getByRole('button', { name: 'Play online' }).click()
  await a.getByLabel('Your name').fill('Ama')
  await a.getByRole('button', { name: 'Create a room' }).click()
  await a.getByRole('button', { name: /Players/ }).click()
  await a.getByRole('radio', { name: '2 players' }).click()
  await a.getByRole('button', { name: 'Create room' }).click()
  const code = (await a.locator('.room-code').textContent())!.trim()
  expect(code).toMatch(/^[A-Z]{4}$/)

  await b.goto(`/r/${code}`)
  await b.getByLabel('Your name').fill('Kofi')
  await b.getByRole('button', { name: 'Join' }).click()

  await a.getByRole('button', { name: 'Tap to sit' }).first().click()
  await b.getByRole('button', { name: 'Tap to sit' }).first().click()
  await a.getByRole('button', { name: 'Start' }).click()

  // Red (Ama) has the first turn on both screens.
  await expect(a.locator('.turn-label')).toHaveText(/Your turn/)
  await expect(b.locator('.turn-label')).toHaveText(/Ama's turn/)
  await a.getByRole('button', { name: /dice/i }).click()
  await expect(b.locator('.turn-label')).not.toHaveText(/Ama's turn/, { timeout: 15_000 })

  // Kofi leaves: the host is told, and can pause.
  await b.close()
  await expect(a.getByText('Kofi left. A computer is playing for them')).toBeVisible({ timeout: 15_000 })

  // Kofi comes back on the same device and is in the game again.
  b = await bContext.newPage()
  await b.goto(`/r/${code}`)
  await expect(b.locator('.turn-label')).toBeVisible({ timeout: 15_000 })
  await expect(b.getByText('Watching')).toHaveCount(0)
})
```

> Adjust the selectors to the real accessible names: the dice button's label in `DiceButton.tsx`, and the Players picker row. Keep the flow and the assertions.

- [ ] **Step 3: Run it locally:** `npm run e2e -w @ludo/web`. Expected: all specs pass, the 4 existing ones and the new one.

- [ ] **Step 4: The docs.** In `README.md`, add "Running locally":

```md
## Running locally

    npm install
    npm run dev -w @ludo/server   # rooms API on :8787 (Node 22)
    npm run dev -w @ludo/web      # the app on :5173, /api proxied to :8787

## Deploying

Cloudflare Workers Builds deploys `main`:
- Build command: `npm run build -w @ludo/web`
- Deploy command: `npx wrangler deploy --config packages/server/wrangler.jsonc`
```

In the spec, add a short "Refinements made while planning" list, copied from the top of this plan.

- [ ] **Step 5: Run everything:** `npm run typecheck && npm test && npm run e2e -w @ludo/web`. Expected: all green.

- [ ] **Step 6: Commit (no push)**

```bash
git add -A packages/web/e2e packages/web/playwright.config.ts README.md docs/superpowers/specs/2026-11-08-online-rooms-design.md
git commit -m "test(e2e): two people play in a room; docs: running the rooms and deploying them"
```

- [ ] **Step 7: The user plays it.** Start both dev servers with `--host` so phones on the same Wi-Fi can reach them: `npm run dev -w @ludo/server -- --ip 0.0.0.0` and `npm run dev -w @ludo/web -- --host`. Give the user the network address.

**User Verification Required:**
Before marking this task complete, you MUST call AskUserQuestion:
```yaml
AskUserQuestion:
  question: "Create a room on one device, join it from another with the code or link, and play a few turns (try leaving and coming back). Does online play work for you?"
  header: "Verification"
  options:
    - label: "Works"
      description: "Rooms, joining, playing, leaving and rejoining all behave as expected."
    - label: "Needs fixes"
      description: "Something's off; I'll describe it and it gets fixed before this is done."
```

**If the user selects "Needs fixes":** the task isn't complete. Fix what they describe, run the checks again, and ask again.

> **Deploying is the user's call.** Before the next push, they need to change the Workers Builds deploy command (see the README). Don't push until they say so.

```json:metadata
{"files": ["packages/web/e2e/online.spec.ts", "packages/web/playwright.config.ts", "README.md", "docs/superpowers/specs/2026-11-08-online-rooms-design.md"], "verifyCommand": "npm run e2e -w @ludo/web", "acceptanceCriteria": ["two-browser e2e passes locally and in CI", "README covers dev and deploy", "user confirms online play works"], "requiresUserVerification": true, "userVerificationPrompt": "Create a room on one device, join it from another with the code or link, and play a few turns (try leaving and coming back). Does online play work for you?"}
```
