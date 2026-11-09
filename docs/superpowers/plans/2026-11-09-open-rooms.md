# Open Rooms and Quick Match Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers-extended-cc:subagent-driven-development (recommended) or superpowers-extended-cc:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Strangers can find a game: quick match by mode into self-running rooms, hosts can open their room to anyone, a list of open rooms, and a Home that leads with online play.

**Architecture:** The room reducer (`packages/server/src/room.ts`) learns two open kinds (`quick`, `hosted`), seat release after 120 s, and works out a `listing` after every input. `RoomObject` sends listings to one new `Directory` Durable Object, which serves the open list and picks rooms for quick match, holding a seat for 10 s. The web app adds Quick match, Find a game and the Who can join row, and reorders Home.

**Tech Stack:** TypeScript, Cloudflare Workers and Durable Objects (SQLite-backed), Vitest with `@cloudflare/vitest-plugin`, React, Testing Library, Playwright.

**User Verification:** YES. Before this is called done, the user quick matches across two devices on the deployed or local build (Task 11).

**Spec:** `docs/superpowers/specs/2026-11-09-open-rooms-design.md`. Refinements made while planning (Task 10 writes them into the spec):
1. **Quick rooms seat everyone who connects:** in the lobby on the first free seat, and in a game by taking the first computer seat still playing. So a quick room opened from Find a game seats you too, rather than leaving you watching.
2. **Nobody here when the wait ends:** the countdown is cleared, and the next person seated starts a fresh 20 s.
3. **The rematch countdown** travels on the `clock` message (`rematchIn`), since a `room` message would reset the board mid-animation. `RoomView` carries `startIn` and `rematchIn` too, for devices that connect later.
4. **Refresh:** Find a game has a **Refresh** button instead of pull-down.
5. **`settings`** carries a required `open: boolean`.

**House rules for every task:**
- Run commands from the repo root `/Users/stefan/Documents/radioactive_labs/ludo` unless a step says otherwise.
- Use Node 22: `export PATH=$HOME/.nvm/versions/node/v22.23.3/bin:$PATH`. Wrangler needs it.
- Commit after each task. **Never push.**
- Comments are short and plain, like the existing code. No defensive `typeof` checks inside trusted code; validation lives at the edges (`validate.ts`, the Worker).

---

## File structure

**Engine (`packages/engine/src`)**
- `protocol.ts` (modify): `Openness`, `Listing`, `RoomView.open/startIn/rematchIn`, `settings.open`, `clock.rematchIn`, `PROTOCOL_VERSION = 4`.
- `modes.ts` (modify): `modeOfSettings`.
- `index.ts` (modify): export `modeOfSettings`.

**Server (`packages/server/src`)**
- `room.ts` (modify): open kinds, quick lobby and rematch, seat release, listings.
- `directory.ts` (create): pure directory logic: stale, browse, pick.
- `Directory.ts` (create): the Durable Object around it; makes quick rooms.
- `RoomObject.ts` (modify): `create` takes `open`; sends listings.
- `index.ts` (modify): `/api/open`, `/api/quick`, `open` on create.
- `validate.ts` (modify): `validDevice`, `validMode`.
- `wrangler.jsonc` (modify): `DIRECTORY` binding, migration `v2`.

**Web (`packages/web/src`)**
- `online/api.ts` (modify): `createRoom` takes `open`; `quickMatch`, `openRooms`.
- `storage.ts` (modify): `loadQuickMode`, `saveQuickMode`.
- `labels.ts` (modify): `QUICK_MODES`, `WHO_CAN_JOIN`, `LISTED_MODE_NAME`.
- `online/useSecondsLeft.ts` (create): a ticking seconds countdown.
- `online/useOnlineGame.ts` (modify): `Clock.startAt/rematchAt`.
- `screens/Setup.tsx` (modify): Who can join row.
- `online/Lobby.tsx` (modify): Open tag, quick lobby countdown, no seat buttons in quick rooms.
- `online/OnlineResults.tsx`, `online/OnlineGame.tsx` (modify): quick results countdown.
- `online/RoomScreen.tsx` (modify): `open` in settings; `onNoSeat`.
- `online/QuickMatch.tsx` (create), `online/FindGame.tsx` (create).
- `online/PlayOnline.tsx` (modify): `onNamed`, headings.
- `screens/Home.tsx` (modify), `App.tsx` (modify).
- `styles.css` (modify).

---

### Task 1: Engine: protocol and mode detection

**Goal:** The shared types for open rooms, and a way to tell a room's mode from its settings.

**Files:**
- Modify: `packages/engine/src/protocol.ts`, `packages/engine/src/modes.ts`, `packages/engine/src/index.ts`
- Test: `packages/engine/test/modes.test.ts`

**Acceptance Criteria:**
- [ ] `modeOfSettings` returns `'classic'` or `'ghana'` when rules and after-kick match a mode exactly, else `undefined`.
- [ ] `Listing`, `Openness` are exported; `RoomView` has `open`, `startIn`, `rematchIn`; `settings` messages carry `open: boolean`; `clock` carries `rematchIn`.
- [ ] `PROTOCOL_VERSION` is 4.

**Verify:** `npm test -w @ludo/engine` → all pass; `npm run typecheck -w @ludo/engine` → clean. (The server and web typecheck fail until Tasks 2 and 6 update their `settings` senders; that's expected.)

**Steps:**

- [ ] **Step 1: The failing test.** Append to `packages/engine/test/modes.test.ts` (and add `modeOfSettings` to its import from `../src/modes`):

```ts
describe('modeOfSettings', () => {
  it('names the mode whose rules and after-kick match exactly', () => {
    expect(modeOfSettings(settingsFor('classic', 2, 'firstWins'))).toBe('classic')
    expect(modeOfSettings(settingsFor('ghana', 4, 'playForPlaces'))).toBe('ghana')
  })

  it('is undefined for rules chosen one by one, or another after-kick', () => {
    const custom = settingsFor('ghana', 4, 'firstWins')
    custom.rules.lineKick = false
    expect(modeOfSettings(custom)).toBeUndefined()
    expect(modeOfSettings({ ...settingsFor('ghana', 4, 'firstWins'), afterKick: 'bonusRoll' })).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run it.** `npm test -w @ludo/engine -- modes` → FAIL: `modeOfSettings` is not exported.

- [ ] **Step 3: `modes.ts`.** Add below `settingsFor`:

```ts
/** The mode these settings are, or undefined when the rules were chosen one by one. */
export const modeOfSettings = (s: Mode): ModeName | undefined =>
  (Object.keys(MODES) as ModeName[]).find(
    (name) => s.afterKick === MODES[name].afterKick && Object.entries(MODES[name].rules).every(([key, on]) => s.rules[key as keyof Settings['rules']] === on),
  )
```

In `index.ts` change the modes export to `export { MODES, modeOfSettings, settingsFor, type Mode, type ModeName } from './modes'`.

- [ ] **Step 4: `protocol.ts`.** Make these changes:

```ts
import type { ModeName } from './modes'
import type { Color, GameEvent, GameState, Move, Settings } from './types'

/** Bumped whenever messages change shape; a device on another version is asked to update. */
export const PROTOCOL_VERSION = 4

/** Who can find a room besides those with its code. Missing: private. `quick` rooms run themselves. */
export type Openness = 'quick' | 'hosted'
```

In `RoomView`, after `deadlineIn`:

```ts
  /** Missing: private. */
  open?: Openness
  /** Quick rooms in the lobby: milliseconds until the game starts by itself. */
  startIn?: number
  /** Quick rooms after a game: milliseconds until the next one's lobby. */
  rematchIn?: number
```

Change the settings message to `| { t: 'settings'; settings: Settings; timer: TurnTimer; open: boolean }`, and the clock message to `| { t: 'clock'; deadlineIn?: number; paused: boolean; pausedFor?: Color; covering: Color[]; rematchIn?: number }`.

Add at the end:

```ts
/** An open room as the room list and quick match see it. */
export type Listing = {
  code: string
  kind: Openness
  mode: ModeName | 'custom'
  phase: 'lobby' | 'playing'
  /** The room's player count. */
  players: number
  /** Seated people, here or away. */
  humans: number
  /** Lobby only. */
  seatsFree: number
  /** Playing only: computer seats still in the game, which anyone can take. */
  computerSeats: Color[]
  timer: TurnTimer
  /** Hosted rooms: the host's name. */
  host?: string
}
```

- [ ] **Step 5: Run.** `npm test -w @ludo/engine && npm run typecheck -w @ludo/engine` → pass.

- [ ] **Step 6: Commit.**

```bash
git add packages/engine
git commit -m "feat(engine): open room protocol: listings, room kinds, countdowns; tell a mode from settings"
```

---

### Task 2: Server: quick and hosted rooms in the reducer

**Goal:** The room reducer runs quick rooms by itself and lets hosts open or close their room.

**Files:**
- Modify: `packages/server/src/room.ts`, `packages/server/test/helpers.ts`, `packages/server/test/play.test.ts`, `packages/server/test/lobby.test.ts`
- Create: `packages/server/test/open.test.ts`

**Acceptance Criteria:**
- [ ] `createRoom` takes `open`. A quick room has no owner and host `''`; `pickHost` leaves it alone.
- [ ] Quick rooms seat each newcomer on the first free seat; `sit`, `stand` and every host message are refused with `illegal`.
- [ ] A quick lobby starts at once when every seat has someone connected, else 20 s after the first person was seated, with computers in the empty seats. With nobody connected the countdown is cleared; the next person seated starts a new one.
- [ ] A finished quick game goes back to the lobby 15 s later; connected watchers are seated on free seats and a new countdown starts.
- [ ] `settings` requires `open: boolean`, sets `room.open` to `'hosted'` or `undefined`.
- [ ] `viewOf` carries `open`, `startIn`, `rematchIn`; the clock message carries `rematchIn`.

**Verify:** `npm test -w @ludo/server` → all pass.

**Steps:**

- [ ] **Step 1: Move the play-out helpers.** Cut `alarm`, `seeded` and `playOut` from `packages/server/test/play.test.ts` into `packages/server/test/helpers.ts` as exports, and import them back in `play.test.ts`. In `helpers.ts`, `alarm` needs `reduce` (already imported) and `die`/`fixedRandom` (already there):

```ts
export const alarm = (room: Room, at: number, random = fixedRandom([die(3)])) => reduce(room, { type: 'alarm' }, at, random)

/** A repeatable stream of random values. */
export const seeded = (seed: number) => () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31)

/** Let the alarms play (computers and timeouts) until `done`. */
export function playOut(room: Room, done: (room: Room) => boolean, random = seeded(7)): Room {
  for (let i = 0; i < 5000 && !done(room); i++) room = alarm(room, Math.min(room.botAt ?? Infinity, room.deadline ?? Infinity), random).room
  return room
}
```

Also give `lobby` an `open` parameter, and add a quick room maker:

```ts
export function lobby(players: 2 | 3 | 4 = 4, open?: Openness): Room {
  return createRoom({ code: 'KQZM', device: 'host', name: 'Ama', settings: settingsFor('ghana', players, 'firstWins'), timer: 'normal', now: T0, open })
}

/** A quick classic room made by Ama's quick match: she holds red until she connects. */
export const quick = (): Room =>
  createRoom({ code: 'QWRT', device: 'ama', name: 'Ama', settings: quickSettings('classic'), timer: QUICK_TIMER, now: T0, open: 'quick' })
```

(import `type Openness` from `@ludo/engine` and `quickSettings`, `QUICK_TIMER` from `../src/room`.)

In `lobby.test.ts`, the three `t: 'settings'` messages (around lines 77, 79, 88) get `open: false`.

- [ ] **Step 2: The failing tests.** Create `packages/server/test/open.test.ts`:

```ts
import type { ClientMessage } from '@ludo/engine'
import { describe, expect, it } from 'vitest'
import { QUICK_REMATCH_MS, QUICK_START_MS } from '../src/room'
import { alarm, join, lobby, playOut, quick, run, say, seatOf, sentTo, T0 } from './helpers'

const lastRoom = (step: ReturnType<typeof run>, device: string) => sentTo(step, device).filter((m) => m.t === 'room').at(-1)

describe('quick rooms', () => {
  it('have no host, and seat everyone who arrives on the next free seat', () => {
    const step = run(quick(), [join('ama'), join('kofi'), join('esi')])
    expect(step.room.host).toBe('')
    expect(['ama', 'kofi', 'esi'].map((d) => seatOf(step.room, d))).toEqual(['red', 'green', 'yellow'])
    expect(lastRoom(step, 'kofi')).toMatchObject({ you: { host: false, seat: 'green' }, room: { open: 'quick' } })
  })

  it('refuse sitting, standing and every host action', () => {
    const { room } = run(quick(), [join('ama')])
    const msgs: ClientMessage[] = [
      { t: 'sit', color: 'blue' },
      { t: 'stand' },
      { t: 'settings', settings: room.settings, timer: 'off', open: false },
      { t: 'start', empty: 'computers' },
    ]
    for (const msg of msgs) {
      const step = run(room, [say('ama', msg)])
      expect(sentTo(step, 'ama')[0]).toEqual({ t: 'error', code: 'illegal' })
      expect([step.room.phase, seatOf(step.room, 'ama'), step.room.timer]).toEqual(['lobby', 'red', 'normal'])
    }
  })

  it('start 20 s after the first person is seated, computers in the empty seats', () => {
    let step = run(quick(), [join('ama')])
    expect(step.room.startAt).toBe(T0 + QUICK_START_MS)
    expect(step.alarm).toBe(T0 + QUICK_START_MS)
    expect(lastRoom(step, 'ama')).toMatchObject({ room: { startIn: QUICK_START_MS } })
    // Someone else arriving doesn't restart the wait.
    step = run(step.room, [join('kofi')], T0 + 5000)
    expect(step.room.startAt).toBe(T0 + QUICK_START_MS)
    step = alarm(step.room, T0 + QUICK_START_MS)
    expect(step.room.phase).toBe('playing')
    expect(step.room.computers).toEqual(['yellow', 'blue'])
    expect(step.room.startAt).toBeUndefined()
  })

  it('start at once when every seat has someone here', () => {
    const step = run(quick(), [join('ama'), join('b'), join('c'), join('d')])
    expect(step.room.phase).toBe('playing')
    expect(step.room.computers).toEqual([])
  })

  it('with nobody here, stop counting; the next person seated gets a fresh wait', () => {
    let step = run(quick(), [join('ama'), { type: 'disconnect', device: 'ama' }])
    expect(step.room.startAt).toBeUndefined()
    step = run(step.room, [join('kofi')], T0 + 60_000)
    expect(step.room.startAt).toBe(T0 + 60_000 + QUICK_START_MS)
  })

  it('a finished game goes back to the lobby 15 s later, seating whoever is here', () => {
    let room = alarm(run(quick(), [join('ama')]).room, T0 + QUICK_START_MS).room
    room = run(room, [join('kofi')], T0 + QUICK_START_MS).room
    room = playOut(room, (r) => r.phase === 'finished')
    expect(room.phase).toBe('finished')
    expect(room.rematchAt).toBeGreaterThan(T0)
    const at = room.rematchAt!
    const step = alarm(room, at)
    expect(step.room.phase).toBe('lobby')
    expect([seatOf(step.room, 'ama'), seatOf(step.room, 'kofi')]).toEqual(['red', 'green'])
    expect(step.room.startAt).toBe(at + QUICK_START_MS)
    expect(step.room.rematchAt).toBeUndefined()
  })

  it('the clock tells devices when the next game is', () => {
    let room = alarm(run(quick(), [join('ama')]).room, T0 + QUICK_START_MS).room
    let last: ReturnType<typeof alarm> | undefined
    for (let i = 0; i < 5000 && room.phase !== 'finished'; i++) {
      last = alarm(room, Math.min(room.botAt ?? Infinity, room.deadline ?? Infinity))
      room = last.room
    }
    const clock = last!.sends.map((s) => s.msg).find((m) => m.t === 'clock')
    expect(clock).toMatchObject({ t: 'clock', rematchIn: QUICK_REMATCH_MS })
  })
})

describe('hosted open rooms', () => {
  it('are made open, and the host can close and open them in the lobby', () => {
    const made = lobby(4, 'hosted')
    expect(made.open).toBe('hosted')
    let step = run(made, [join('host'), say('host', { t: 'settings', settings: made.settings, timer: 'normal', open: false })])
    expect(step.room.open).toBeUndefined()
    expect(lastRoom(step, 'host')).toMatchObject({ room: { open: undefined } })
    step = run(step.room, [say('host', { t: 'settings', settings: made.settings, timer: 'normal', open: true })])
    expect(step.room.open).toBe('hosted')
  })

  it('refuse settings without a yes or no for open', () => {
    const made = lobby(4)
    const step = run(made, [join('host'), say('host', { t: 'settings', settings: made.settings, timer: 'normal' } as unknown as ClientMessage)])
    expect(sentTo(step, 'host').find((m) => m.t === 'error')).toEqual({ t: 'error', code: 'illegal' })
  })
})
```

- [ ] **Step 3: Run them.** `npm test -w @ludo/server -- open` → FAIL (no `quick`, `QUICK_START_MS`, `open`).

- [ ] **Step 4: `room.ts`: types and constants.** Add `Openness` to the engine import, and `settingsFor`, `type ModeName`. Then:

```ts
export const QUICK_START_MS = 20_000
export const QUICK_REMATCH_MS = 15_000
export const QUICK_TIMER: TurnTimer = 'normal'
export const quickSettings = (mode: ModeName): Settings => settingsFor(mode, 4, 'firstWins')
```

In `Room`, after `lastActive`:

```ts
  /** Missing: private, the code only. */
  open?: Openness
  /** Quick rooms in the lobby: when the game starts by itself. */
  startAt?: number
  /** Quick rooms after a game: when the next one's lobby opens. */
  rematchAt?: number
```

Change `createRoom`:

```ts
/** The creator starts on the first seat; it stays theirs when they first connect. A quick room has no owner or host. */
export function createRoom(o: { code: string; device: string; name: string; settings: Settings; timer: TurnTimer; now: number; open?: Openness }): Room {
  const settings = cleanSettings(o.settings)
  const quick = o.open === 'quick'
  return {
    code: o.code,
    phase: 'lobby',
    owner: quick ? undefined : o.device,
    host: quick ? '' : o.device,
    open: o.open,
    settings,
    // …the rest as now
  }
}
```

- [ ] **Step 5: Host and seats.** First line of `pickHost`: `if (room.open === 'quick') return`.

In `message`, the `sit` and `stand` cases start with `if (room.open === 'quick') return refuse(ctx, device, 'illegal')`. The `settings` case becomes:

```ts
    case 'settings': {
      if (!host || room.phase !== 'lobby' || !validSettings(msg.settings) || !validTimer(msg.timer) || typeof msg.open !== 'boolean') return refuse(ctx, device, 'illegal')
      room.settings = cleanSettings(msg.settings)
      room.timer = msg.timer
      room.open = msg.open ? 'hosted' : undefined
      for (const o of room.members) if (o.seat && !SEATS[msg.settings.players].includes(o.seat)) o.seat = undefined
      pickHost(room)
      return broadcastRoom(ctx)
    }
```

(`host` is never true in a quick room, so its host messages are already refused.)

In `connect`, after the member is found or made and before `pickHost(room)`, add `if (!m.seat) claim(room, m)`, with:

```ts
/** Quick rooms seat whoever arrives on the first free seat. */
function claim(room: Room, m: Member): void {
  if (room.open === 'quick' && room.phase === 'lobby') m.seat = SEATS[room.settings.players].find((c) => !room.members.some((o) => o.seat === c))
}
```

(Task 3 widens `claim` to games.)

- [ ] **Step 6: The quick lobby clock.** Add:

```ts
/**
 * Quick rooms start by themselves: at once when every seat has someone here, else when the wait
 * is up. With nobody here the wait stops; the next person seated starts it again. True when
 * something devices show changed.
 */
function quickLobby(ctx: Ctx): boolean {
  const { room, now } = ctx
  if (room.open !== 'quick' || room.phase !== 'lobby') return false
  const here = room.members.filter((m) => m.seat && m.connected).length
  const was = room.startAt
  if (here === SEATS[room.settings.players].length || (here > 0 && room.startAt !== undefined && now >= room.startAt)) {
    room.startAt = undefined
    return start(ctx, 'computers')
  }
  room.startAt = here === 0 ? undefined : (room.startAt ?? now + QUICK_START_MS)
  return room.startAt !== was
}
```

In `reduce`, after the input is handled (both branches) and before the return:

```ts
  if (quickLobby(ctx)) broadcastRoom(ctx)
```

In `start`, set `room.startAt = undefined` with the other resets.

- [ ] **Step 7: The quick rematch.** Pull the body of the `rematch` case out into a function and use it from the case and from `tick`:

```ts
/** Back to the lobby with the same settings. Seats of players who left are free again; a quick room seats whoever is here. */
function rematch(ctx: Ctx): void {
  const { room } = ctx
  room.phase = 'lobby'
  room.log = []
  room.game = undefined
  room.computers = []
  room.covering = []
  room.paused = false
  room.pausedFor = undefined
  room.deadline = room.botAt = room.readyAt = room.rematchAt = undefined
  for (const o of room.members) if (!o.connected) o.seat = undefined
  pickHost(room)
  prune(room)
  if (room.open === 'quick') for (const o of room.members) if (o.connected && !o.seat) claim(room, o)
}
```

```ts
    case 'rematch':
      if (!host || room.phase !== 'finished') return refuse(ctx, m.device, 'illegal')
      rematch(ctx)
      return broadcastRoom(ctx)
```

In `apply`, the finished branch becomes:

```ts
  if (next.status === 'finished') {
    room.phase = 'finished'
    room.deadline = room.botAt = undefined
    if (room.open === 'quick') room.rematchAt = ctx.now + QUICK_REMATCH_MS
  } else {
```

`tick` becomes:

```ts
function tick(ctx: Ctx): void {
  const { room, now } = ctx
  if (room.phase === 'finished' && room.rematchAt !== undefined && now >= room.rematchAt) {
    rematch(ctx)
    return broadcastRoom(ctx)
  }
  if (room.phase !== 'playing' || room.paused) return
  const due = room.botAt ?? room.deadline
  if (due === undefined || now < due) return
  // Should never fail; if it does, stop the clocks rather than wake up for it again and again.
  if (!computerAct(ctx, gameOf(room))) room.deadline = room.botAt = undefined
}
```

(`quickLobby` at the end of `reduce` sets the new countdown after a rematch.)

- [ ] **Step 8: Views and the alarm.** `clock` adds `rematchIn`:

```ts
const msLeft = (at: number | undefined, now: number) => (at === undefined ? undefined : Math.max(0, at - now))

function clock(ctx: Ctx): void {
  const { room, now } = ctx
  ctx.sends.push({ to: 'all', msg: { t: 'clock', deadlineIn: msLeft(room.deadline, now), paused: room.paused, pausedFor: room.pausedFor, covering: room.covering, rematchIn: msLeft(room.rematchAt, now) } })
}
```

`viewOf` uses `msLeft` for `deadlineIn` and adds `open: room.open, startIn: msLeft(room.startAt, now), rematchIn: msLeft(room.rematchAt, now)`.

In `reduce`, the alarm becomes `Math.min(room.botAt ?? Infinity, room.deadline ?? Infinity, room.startAt ?? Infinity, room.rematchAt ?? Infinity, room.lastActive + DAY)`. Move it into a `nextAlarm(room)` function; Tasks 3 and 4 add to it.

- [ ] **Step 9: Run.** `npm test -w @ludo/server && npm run typecheck -w @ludo/server` → pass, including the existing lobby and play tests.

- [ ] **Step 10: Commit.**

```bash
git add packages/server
git commit -m "feat(server): quick rooms run themselves; hosts can open their room to anyone"
```

---

### Task 3: Server: left seats in open rooms

**Goal:** In open rooms a player away 120 s mid-game gives their seat to the computer for anyone to take, and gets it back if it's still free. Quick rooms put a newcomer onto a computer seat.

**Files:**
- Modify: `packages/server/src/room.ts`
- Test: `packages/server/test/open.test.ts`

**Acceptance Criteria:**
- [ ] Open rooms only: a seated player disconnected 120 s during a game loses the seat; it moves from `covering` to `computers`, and the room remembers whose it was (`leftSeats`).
- [ ] Back within 120 s: nothing changes. Back later with the seat still a computer's: it's theirs again (covered until their next turn, as with takeover).
- [ ] Private rooms keep step 1's rule.
- [ ] Quick rooms seat a newcomer during a game on the first computer seat still playing.
- [ ] `leftSeats` and pending releases are cleared at start and rematch.

**Verify:** `npm test -w @ludo/server -- open` → pass.

**Steps:**

- [ ] **Step 1: The failing tests.** Append to `open.test.ts` (add `SEAT_RELEASE_MS` to the room import, and `type Openness` from `@ludo/engine`):

```ts
describe('left seats in open rooms', () => {
  /** Ama (host, red) and Kofi (yellow) playing a 2-player room. */
  const playing = (open: Openness | undefined = 'hosted') =>
    run(lobby(2, open), [join('host', 'Ama'), join('kofi', 'Kofi'), say('kofi', { t: 'sit', color: 'yellow' }), say('host', { t: 'start', empty: 'computers' })]).room
  const gone = (room = playing()) => run(room, [{ type: 'disconnect', device: 'kofi' }])

  it('away 120 s, the seat goes to the computer and anyone can take it', () => {
    let step = gone()
    expect(step.room.covering).toContain('yellow')
    expect(step.alarm).toBeLessThanOrEqual(T0 + SEAT_RELEASE_MS)
    step = alarm(step.room, T0 + SEAT_RELEASE_MS)
    expect(step.room.computers).toEqual(['yellow'])
    expect(step.room.covering).not.toContain('yellow')
    expect(seatOf(step.room, 'kofi')).toBeUndefined()
    step = run(step.room, [join('esi'), say('esi', { t: 'takeover', color: 'yellow' })], T0 + SEAT_RELEASE_MS)
    expect(seatOf(step.room, 'esi')).toBe('yellow')
  })

  it('back while the computer still has it, the seat is theirs again', () => {
    const released = alarm(gone().room, T0 + SEAT_RELEASE_MS).room
    const step = run(released, [join('kofi', 'Kofi')], T0 + SEAT_RELEASE_MS + 1000)
    expect(seatOf(step.room, 'kofi')).toBe('yellow')
    expect(step.room.computers).toEqual([])
  })

  it('back in time, nothing is given away', () => {
    const back = run(gone().room, [join('kofi', 'Kofi')], T0 + 60_000).room
    const step = alarm(back, T0 + SEAT_RELEASE_MS)
    expect(step.room.computers).toEqual([])
    expect(seatOf(step.room, 'kofi')).toBe('yellow')
  })

  it('private rooms keep the seat for its player', () => {
    const step = alarm(gone(playing(undefined)).room, T0 + SEAT_RELEASE_MS)
    expect(step.room.computers).toEqual([])
    expect(seatOf(step.room, 'kofi')).toBe('yellow')
  })

  it('quick rooms seat a newcomer on a computer seat', () => {
    const room = alarm(run(quick(), [join('ama')]).room, T0 + QUICK_START_MS).room
    const step = run(room, [join('kofi')], T0 + QUICK_START_MS)
    expect(seatOf(step.room, 'kofi')).toBe('green')
    expect(step.room.computers).toEqual(['yellow', 'blue'])
  })
})
```

- [ ] **Step 2: Run them.** `npm test -w @ludo/server -- open` → FAIL.

- [ ] **Step 3: State.** `Member` gets `leftAt?: number` (when a seated player dropped mid-game, open rooms). `Room` gets:

```ts
  /** Open rooms: seats given to the computer after their player stayed away, so they get them back if still free. */
  leftSeats?: Partial<Record<Color, string>>
```

and `export const SEAT_RELEASE_MS = 120_000`.

- [ ] **Step 4: Taking seats.** Pull the seat-taking part of `takeover` into a helper, and widen `claim`:

```ts
/** Computer seats a watcher could take: still in the game. */
const takeable = (room: Room, game: GameState): Color[] => room.computers.filter((c) => getPlayer(game, c).finishedPlace === undefined)

/** A computer seat becomes the member's. Covered until its next turn starts, like a player who is back. */
function takeSeat(room: Room, m: Member, color: Color): void {
  room.computers = room.computers.filter((c) => c !== color)
  room.covering.push(color)
  m.seat = color
}

/**
 * Open rooms seat some arrivals themselves: a player gets back the seat they stayed away from,
 * if it's still the computer's; a quick room seats anyone, on a free seat or a computer seat.
 */
function claim(room: Room, m: Member): void {
  if (room.open === 'quick' && room.phase === 'lobby') {
    m.seat = SEATS[room.settings.players].find((c) => !room.members.some((o) => o.seat === c))
    return
  }
  if (!room.open || room.phase !== 'playing') return
  const own = COLORS.find((c) => room.leftSeats?.[c] === m.device)
  const color = own && room.computers.includes(own) ? own : room.open === 'quick' ? takeable(room, gameOf(room))[0] : undefined
  if (color) takeSeat(room, m, color)
}
```

`takeover` uses it:

```ts
function takeover(ctx: Ctx, m: Member, color: Color): void {
  const { room } = ctx
  if (room.phase !== 'playing' || !room.computers.includes(color) || m.seat) return refuse(ctx, m.device, 'illegal')
  const wasIdle = !anyoneSeatedConnected(room)
  takeSeat(room, m, color)
  pickHost(room)
  back(ctx, color, wasIdle)
  broadcastRoom(ctx)
}
```

In `connect`, set `m.leftAt = undefined` for a returning member. `wasIdle` is worked out before `claim`, and `back(ctx, m.seat, wasIdle)` already runs after, so a claimed seat restarts the clock as takeover does.

- [ ] **Step 5: Leaving and release.** In `disconnect`:

```ts
  if (room.phase === 'playing') {
    leaveGame(ctx, m)
    if (room.open && m.seat && !room.computers.includes(m.seat)) m.leftAt = ctx.now
  }
```

Add:

```ts
/** Open rooms: a player away this long gives their seat to the computer, for anyone to take. */
function release(ctx: Ctx): void {
  const { room, now } = ctx
  const due = room.members.filter((m) => m.leftAt !== undefined && now >= m.leftAt + SEAT_RELEASE_MS)
  if (due.length === 0) return
  for (const m of due) {
    m.leftAt = undefined
    if (room.phase !== 'playing' || !m.seat || m.connected) continue
    room.covering = room.covering.filter((c) => c !== m.seat)
    room.computers.push(m.seat)
    room.leftSeats = { ...room.leftSeats, [m.seat]: m.device }
    m.seat = undefined
  }
  pickHost(room)
  prune(room)
  broadcastRoom(ctx)
}
```

Call `release(ctx)` as the first line of `tick`. In `start` and `rematch`, add `room.leftSeats = undefined` and `for (const o of room.members) o.leftAt = undefined`.

`nextAlarm` adds the releases:

```ts
const releaseAt = (room: Room) => Math.min(...room.members.map((m) => (m.leftAt === undefined ? Infinity : m.leftAt + SEAT_RELEASE_MS)))
```

and `releaseAt(room)` goes into the `Math.min`.

- [ ] **Step 6: Run.** `npm test -w @ludo/server && npm run typecheck -w @ludo/server` → pass.

- [ ] **Step 7: Commit.**

```bash
git add packages/server
git commit -m "feat(server): in open rooms a seat left for 2 minutes opens to others, and is theirs again if free"
```

---

### Task 4: Server: listings from the reducer

**Goal:** After every input the reducer says what the directory should show of the room, only when it changed or every 10 minutes.

**Files:**
- Modify: `packages/server/src/room.ts`
- Test: `packages/server/test/listing.test.ts` (create)

**Acceptance Criteria:**
- [ ] `listingOf(room)` is `null` for private rooms, finished games, full lobbies and games with no takeable computer seat; otherwise a `Listing` with the mode worked out by `modeOfSettings` (`'custom'` when none).
- [ ] `Step.listing` is the new listing or `null` when it changed, `undefined` otherwise; a listed room re-sends it every 10 minutes and its alarm wakes for that.
- [ ] Removing an expired listed room returns `listing: null`.

**Verify:** `npm test -w @ludo/server -- listing` → pass.

**Steps:**

- [ ] **Step 1: The failing tests.** Create `packages/server/test/listing.test.ts`:

```ts
import { settingsFor } from '@ludo/engine'
import { describe, expect, it } from 'vitest'
import { DAY, LISTING_REFRESH_MS, QUICK_START_MS } from '../src/room'
import { alarm, join, lobby, quick, run, say, T0 } from './helpers'

describe('listings', () => {
  it('a hosted lobby is listed with its host and free seats', () => {
    expect(run(lobby(4, 'hosted'), [join('host', 'Ama')]).listing).toEqual({
      code: 'KQZM',
      kind: 'hosted',
      mode: 'ghana',
      phase: 'lobby',
      players: 4,
      humans: 1,
      seatsFree: 3,
      computerSeats: [],
      timer: 'normal',
      host: 'Ama',
    })
  })

  it('a private room is never listed', () => {
    expect(run(lobby(4), [join('host'), join('kofi')]).listing).toBeUndefined()
  })

  it('is sent only when it changes, and again every 10 minutes', () => {
    const first = run(lobby(4, 'hosted'), [join('host', 'Ama')])
    const same = run(first.room, [say('host', { t: 'rename', name: 'Ama' })], T0 + 1000)
    expect(same.listing).toBeUndefined()
    expect(same.alarm).toBeLessThanOrEqual(T0 + LISTING_REFRESH_MS)
    expect(alarm(same.room, T0 + LISTING_REFRESH_MS).listing).toMatchObject({ code: 'KQZM' })
  })

  it('a quick game with computer seats lists them; a full one is taken off', () => {
    const started = alarm(run(quick(), [join('ama')]).room, T0 + QUICK_START_MS)
    expect(started.listing).toMatchObject({ kind: 'quick', mode: 'classic', phase: 'playing', humans: 1, seatsFree: 0, computerSeats: ['green', 'yellow', 'blue'] })
    // Listed while filling, taken off as the last seat starts the game.
    expect(run(quick(), [join('ama'), join('b'), join('c'), join('d')]).listing).toBeNull()
    const filled = run(started.room, [join('b'), join('c'), join('d')], T0 + QUICK_START_MS)
    expect(filled.listing).toBeNull()
  })

  it('rules chosen one by one are custom', () => {
    const custom = settingsFor('ghana', 4, 'firstWins')
    custom.rules.labourer = false
    const step = run(lobby(4, 'hosted'), [join('host', 'Ama'), say('host', { t: 'settings', settings: custom, timer: 'normal', open: true })])
    expect(step.listing).toMatchObject({ mode: 'custom' })
  })

  it('closing a room takes it off; an expired listed room is taken off as it goes', () => {
    const listed = run(lobby(4, 'hosted'), [join('host', 'Ama')])
    const closed = run(listed.room, [say('host', { t: 'settings', settings: listed.room.settings, timer: 'normal', open: false })])
    expect(closed.listing).toBeNull()
    const expired = alarm(listed.room, T0 + DAY)
    expect([expired.remove, expired.listing]).toEqual([true, null])
  })
})
```

- [ ] **Step 2: Run them.** `npm test -w @ludo/server -- listing` → FAIL.

- [ ] **Step 3: `room.ts`.** Import `modeOfSettings` and `type Listing` from the engine. Add `export const LISTING_REFRESH_MS = 10 * 60_000`. `Room` gets:

```ts
  /** The listing last sent to the directory, and when. */
  listed?: Listing
  listedAt?: number
```

`Step` gets `listing?: Listing | null`. Add:

```ts
/** What the directory shows of an open room; null while nobody could play in it. */
export function listingOf(room: Room): Listing | null {
  if (!room.open || room.phase === 'finished') return null
  const players = SEATS[room.settings.players].length
  const humans = room.members.filter((m) => m.seat).length
  const seatsFree = room.phase === 'lobby' ? players - humans : 0
  const computerSeats = room.phase === 'playing' ? takeable(room, gameOf(room)) : []
  if (seatsFree === 0 && computerSeats.length === 0) return null
  return {
    code: room.code,
    kind: room.open,
    mode: modeOfSettings(room.settings) ?? 'custom',
    phase: room.phase,
    players,
    humans,
    seatsFree,
    computerSeats,
    timer: room.timer,
    host: room.open === 'hosted' ? memberOf(room, room.host)?.name : undefined,
  }
}

/** The listing to send the directory when it changed or is due a refresh; undefined when there's nothing to send. */
export function relist(room: Room, now: number): Listing | null | undefined {
  const listing = listingOf(room)
  const unchanged = JSON.stringify(listing) === JSON.stringify(room.listed ?? null)
  if (unchanged && (!listing || now < room.listedAt! + LISTING_REFRESH_MS)) return undefined
  room.listed = listing ?? undefined
  room.listedAt = listing ? now : undefined
  return listing
}
```

In `reduce`: the expiry return becomes `return { room, sends: [], alarm: now, remove: true, listing: room.listed ? null : undefined }`. The normal return computes `const listing = relist(room, now)` first and returns `{ room, sends: ctx.sends, alarm: nextAlarm(room), remove: false, listing }`. `nextAlarm` adds `room.listedAt === undefined ? Infinity : room.listedAt + LISTING_REFRESH_MS`.

- [ ] **Step 4: Run.** `npm test -w @ludo/server && npm run typecheck -w @ludo/server` → pass.

- [ ] **Step 5: Commit.**

```bash
git add packages/server
git commit -m "feat(server): rooms work out their listing for the open room list"
```

---

### Task 5: Server: the directory's logic

**Goal:** Pure functions for the directory: drop stale listings, list for browsing, pick a quick room with seat holds.

**Files:**
- Create: `packages/server/src/directory.ts`, `packages/server/test/directory.test.ts`

**Acceptance Criteria:**
- [ ] `staleCodes` returns codes not updated for 30 minutes.
- [ ] `browse` returns at most 50 listings, most recently updated first.
- [ ] `pick` only considers quick listings of the mode, not `skip`, with seats left after other devices' live holds. Lobbies come first, fuller first, then games with a computer seat. It adds a 10 s hold for the device (replacing its old one) and drops expired holds.

**Verify:** `npm test -w @ludo/server -- directory` → pass.

**Steps:**

- [ ] **Step 1: The failing tests.** Create `packages/server/test/directory.test.ts`:

```ts
import type { Listing } from '@ludo/engine'
import { describe, expect, it } from 'vitest'
import { browse, HOLD_MS, pick, STALE_MS, staleCodes, type Entry, type Hold } from '../src/directory'

const NOW = 5_000_000
const listing = (code: string, over: Partial<Listing> = {}): Listing => ({
  code,
  kind: 'quick',
  mode: 'ghana',
  phase: 'lobby',
  players: 4,
  humans: 1,
  seatsFree: 3,
  computerSeats: [],
  timer: 'normal',
  ...over,
})
const entries = (...list: [Listing, number?][]) => new Map<string, Entry>(list.map(([l, at = NOW]) => [l.code, { listing: l, at }]))

describe('directory', () => {
  it('finds listings not heard about for 30 minutes', () => {
    expect(staleCodes(entries([listing('AAAA'), NOW - STALE_MS]), [listing('BBBB'), NOW - STALE_MS + 1]), NOW)).toEqual(['AAAA'])
  })

  it('lists the most recently updated first, at most 50', () => {
    const many = entries(...Array.from({ length: 60 }, (_, i): [Listing, number] => [listing(`R${String(i).padStart(3, '0')}`), NOW - i]))
    const shown = browse(many)
    expect(shown).toHaveLength(50)
    expect(shown[0].code).toBe('R000')
  })

  it('picks a quick lobby of the mode, fuller first, before a game with a computer seat', () => {
    const all = entries(
      [listing('GAME', { phase: 'playing', seatsFree: 0, computerSeats: ['blue'], humans: 3 })],
      [listing('ONE', { humans: 1, seatsFree: 3 })],
      [listing('TWO', { humans: 2, seatsFree: 2 })],
      [listing('CLSC', { mode: 'classic', humans: 3, seatsFree: 1 })],
      [listing('HOST', { kind: 'hosted', humans: 3, seatsFree: 1 })],
    )
    expect(pick(all, [], { device: 'd', mode: 'ghana', now: NOW }).code).toBe('TWO')
    expect(pick(entries([listing('GAME', { phase: 'playing', seatsFree: 0, computerSeats: ['blue'] })]), [], { device: 'd', mode: 'ghana', now: NOW }).code).toBe('GAME')
    expect(pick(all, [], { device: 'd', mode: 'ghana', skip: 'TWO', now: NOW }).code).toBe('ONE')
  })

  it('holds the seat for 10 s, so the last seat goes to one device only', () => {
    const last = entries([listing('LAST', { humans: 3, seatsFree: 1 })])
    const first = pick(last, [], { device: 'a', mode: 'ghana', now: NOW })
    expect(first).toEqual({ code: 'LAST', holds: [{ code: 'LAST', device: 'a', until: NOW + HOLD_MS }] })
    expect(pick(last, first.holds, { device: 'b', mode: 'ghana', now: NOW + 1 }).code).toBeUndefined()
    // The device itself can ask again, and the hold runs out.
    expect(pick(last, first.holds, { device: 'a', mode: 'ghana', now: NOW + 1 }).code).toBe('LAST')
    const later = pick(last, first.holds, { device: 'b', mode: 'ghana', now: NOW + HOLD_MS })
    expect(later.code).toBe('LAST')
    expect(later.holds).toEqual([{ code: 'LAST', device: 'b', until: NOW + 2 * HOLD_MS }])
  })

  it('never picks a stale listing', () => {
    expect(pick(entries([listing('OLD'), NOW - STALE_MS]), [], { device: 'd', mode: 'ghana', now: NOW }).code).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run them.** → FAIL (no module).

- [ ] **Step 3: `directory.ts`.**

```ts
import type { Listing, ModeName } from '@ludo/engine'

export const STALE_MS = 30 * 60_000
export const HOLD_MS = 10_000
export const MAX_LISTED = 50

export type Entry = { listing: Listing; at: number }
/** A seat kept for a device that quick match just sent to a room. */
export type Hold = { code: string; device: string; until: number }
export type Listings = Map<string, Entry>

/** Listings not heard about for 30 minutes: their rooms went without saying so. */
export const staleCodes = (entries: Listings, now: number): string[] =>
  [...entries].filter(([, e]) => now - e.at >= STALE_MS).map(([code]) => code)

/** What people browse: the most recently updated first. */
export const browse = (entries: Listings): Listing[] =>
  [...entries.values()].sort((a, b) => b.at - a.at).slice(0, MAX_LISTED).map((e) => e.listing)

/** Lobbies before games, fuller ones first. */
const rank = ({ listing }: Entry) => (listing.phase === 'lobby' ? 10 : 0) + listing.humans

/**
 * The quick room in this mode to send a device to, holding it a seat for a few seconds so two
 * quick matches can't both get the last one. No code when a new room is needed.
 */
export function pick(entries: Listings, holds: Hold[], o: { device: string; mode: ModeName; skip?: string; now: number }): { code?: string; holds: Hold[] } {
  const live = holds.filter((h) => h.until > o.now && h.device !== o.device)
  const seats = ({ listing }: Entry) =>
    (listing.phase === 'lobby' ? listing.seatsFree : listing.computerSeats.length) - live.filter((h) => h.code === listing.code).length
  const best = [...entries.values()]
    .filter((e) => e.listing.kind === 'quick' && e.listing.mode === o.mode && e.listing.code !== o.skip && o.now - e.at < STALE_MS && seats(e) > 0)
    .sort((a, b) => rank(b) - rank(a) || b.at - a.at)[0]
  if (!best) return { holds: live }
  return { code: best.listing.code, holds: [...live, { code: best.listing.code, device: o.device, until: o.now + HOLD_MS }] }
}
```

(Note: `pick` with no result drops the device's own old hold too; that's fine, it's asking again.)

- [ ] **Step 4: Run.** `npm test -w @ludo/server -- directory` → pass.

- [ ] **Step 5: Commit.**

```bash
git add packages/server
git commit -m "feat(server): directory logic: stale listings, the open list, quick match picks with seat holds"
```

---

### Task 6: Server: the Directory object, room publishing and the endpoints

**Goal:** Listings flow from rooms to one `Directory` object, which serves `GET /api/open` and `POST /api/quick`; `POST /api/rooms` takes `open`.

**Files:**
- Create: `packages/server/src/Directory.ts`
- Modify: `packages/server/src/RoomObject.ts`, `packages/server/src/index.ts`, `packages/server/src/validate.ts`, `packages/server/wrangler.jsonc`, `packages/server/test/env.d.ts`, `packages/server/test/api.test.ts`, `packages/server/test/validate.test.ts`

**Acceptance Criteria:**
- [ ] `RoomObject` sends every `step.listing` (and a new room's first listing) to the directory without waiting; a failed send is logged with `console.warn`.
- [ ] `GET /api/open` → `{ rooms }`; `503` if the directory fails.
- [ ] `POST /api/quick { device, name, mode, skip? }` → `{ code }` of a picked room, or of a new quick room (rate-limited like Create: `429`). `400` for a bad body, `503` when no code is free.
- [ ] Two quick matches at once never make two rooms: the directory lists a new room before it's made.
- [ ] `POST /api/rooms` accepts `open: boolean`.
- [ ] `wrangler.jsonc` has the `DIRECTORY` binding and migration `v2`.

**Verify:** `npm test -w @ludo/server && npm run typecheck -w @ludo/server` → pass.

**Steps:**

- [ ] **Step 1: Config.** In `wrangler.jsonc`:

```jsonc
  // One Durable Object per room, named by its code, and one directory of the open rooms.
  "durable_objects": {
    "bindings": [
      { "name": "ROOMS", "class_name": "RoomObject" },
      { "name": "DIRECTORY", "class_name": "Directory" }
    ]
  },
  "migrations": [
    { "tag": "v1", "new_sqlite_classes": ["RoomObject"] },
    { "tag": "v2", "new_sqlite_classes": ["Directory"] }
  ],
```

In `test/env.d.ts`: `durableNamespaces: 'RoomObject' | 'Directory'`.

- [ ] **Step 2: `validate.ts`.** Add, with tests in `validate.test.ts`:

```ts
export const validDevice = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 64
export const validMode = (value: unknown): value is ModeName => value === 'classic' || value === 'ghana'
export const validCode = (value: unknown): value is string => typeof value === 'string' && /^[A-Z]{4}$/.test(value)
```

```ts
  it('knows devices, quick match modes and codes', () => {
    expect([validDevice('abc'), validDevice(''), validDevice('x'.repeat(65)), validDevice(3)]).toEqual([true, false, false, false])
    expect([validMode('ghana'), validMode('classic'), validMode('custom')]).toEqual([true, true, false])
    expect([validCode('KQZM'), validCode('kqzm'), validCode('KQZ')]).toEqual([true, false, false])
  })
```

- [ ] **Step 3: The failing API tests.** In `api.test.ts` add helpers and tests:

```ts
const post = (path: string, body: unknown, ip = `10.1.0.${++ipCounter}`) =>
  exports.default.fetch(`${BASE}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': ip }, body: JSON.stringify(body) })
const quickMatch = async (device: string, mode = 'classic', skip?: string) => {
  const res = await post('/api/quick', { device, name: device, mode, skip })
  return { status: res.status, code: res.ok ? ((await res.json()) as { code: string }).code : undefined }
}
const openList = async () => ((await (await exports.default.fetch(`${BASE}/api/open`)).json()) as { rooms: Listing[] }).rooms

describe('open rooms', () => {
  it('a hosted open room is listed; a private one is not', async () => {
    const open = ((await (await create({ ...goodBody, open: true })).json()) as { code: string }).code
    const shut = await newRoom()
    await settle()
    const codes = (await openList()).map((l) => l.code)
    expect(codes).toContain(open)
    expect(codes).not.toContain(shut)
    expect((await openList()).find((l) => l.code === open)).toMatchObject({ kind: 'hosted', host: 'Ama', seatsFree: 3 })
  })

  it('refuses a bad open', async () => {
    expect((await create({ ...goodBody, open: 'yes' })).status).toBe(400)
  })

  it('quick match makes a room, and the next quick match in that mode joins it', async () => {
    const first = await quickMatch('q1', 'ghana')
    expect(first.status).toBe(200)
    await settle()
    expect((await quickMatch('q2', 'ghana')).code).toBe(first.code)
    // Skipping it makes another.
    const other = await quickMatch('q3', 'ghana', first.code)
    expect(other.code).not.toBe(first.code)
  })

  it('the quick match creator holds the first seat when they connect', async () => {
    const { code } = await quickMatch('q4', 'classic', 'ZZZZ')
    const q4 = await open(code!, 'q4')
    await settle()
    expect(lastRoom(q4.got)).toMatchObject({ you: { seat: 'red', host: false }, room: { open: 'quick' } })
  })

  it('refuses a bad quick match', async () => {
    expect((await post('/api/quick', { device: 'd', name: 'D', mode: 'custom' })).status).toBe(400)
    expect((await post('/api/quick', { device: '', name: 'D', mode: 'ghana' })).status).toBe(400)
    expect((await post('/api/quick', { device: 'd', name: 'D', mode: 'ghana', skip: 'bad' })).status).toBe(400)
  })
})
```

(Import `type Listing` from `@ludo/engine`. The directory is shared across tests in the file, so these tests compare codes rather than counting listings.)

Run: `npm test -w @ludo/server -- api` → FAIL.

- [ ] **Step 4: `Directory.ts`.**

```ts
import type { Listing, ModeName } from '@ludo/engine'
import { DurableObject } from 'cloudflare:workers'
import { browse, pick, staleCodes, type Entry, type Hold, type Listings } from './directory'
import { QUICK_TIMER, quickSettings } from './room'
import type { Env } from './RoomObject'
import { makeCode } from './validate'

const KEY = 'l:'

/** The one directory of open rooms: what rooms say about themselves, the room list, and quick match. */
export class Directory extends DurableObject<Env> {
  private entries?: Listings
  /** Seats held for quick matches; a few seconds each, so not worth storing. */
  private holds: Hold[] = []

  private async load(): Promise<Listings> {
    if (!this.entries) {
      const stored = await this.ctx.storage.list<Entry>({ prefix: KEY })
      this.entries = new Map([...stored].map(([key, entry]) => [key.slice(KEY.length), entry]))
    }
    return this.entries
  }

  /** The listings, less those whose rooms stopped sending. */
  private async fresh(): Promise<Listings> {
    const entries = await this.load()
    const stale = staleCodes(entries, Date.now())
    if (stale.length === 0) return entries
    for (const code of stale) entries.delete(code)
    await this.ctx.storage.delete(stale.map((code) => KEY + code))
    return entries
  }

  /** A room's listing, or null to take it off. */
  async put(code: string, listing: Listing | null): Promise<void> {
    const entries = await this.load()
    if (!listing) {
      entries.delete(code)
      await this.ctx.storage.delete(KEY + code)
      return
    }
    const entry: Entry = { listing, at: Date.now() }
    entries.set(code, entry)
    await this.ctx.storage.put(KEY + code, entry)
  }

  async list(): Promise<Listing[]> {
    return browse(await this.fresh())
  }

  /** A quick room for this device, its seat held; undefined when a new one is needed. */
  async quick(o: { device: string; mode: ModeName; skip?: string }): Promise<string | undefined> {
    const picked = pick(await this.fresh(), this.holds, { ...o, now: Date.now() })
    this.holds = picked.holds
    return picked.code
  }

  /**
   * A new quick room with the device on its first seat, unless one turned up meanwhile. It's
   * listed before it's made, so a quick match arriving while it's made joins it rather than
   * making another.
   */
  async make(o: { device: string; name: string; mode: ModeName; skip?: string }): Promise<string | undefined> {
    const found = await this.quick(o)
    if (found) return found
    const entries = await this.load()
    for (let i = 0; i < 5; i++) {
      const code = makeCode(Math.random)
      if (entries.has(code)) continue
      const listing: Listing = { code, kind: 'quick', mode: o.mode, phase: 'lobby', players: 4, humans: 1, seatsFree: 3, computerSeats: [], timer: QUICK_TIMER }
      entries.set(code, { listing, at: Date.now() })
      const room = this.env.ROOMS.get(this.env.ROOMS.idFromName(code))
      if (await room.create({ code, device: o.device, name: o.name, settings: quickSettings(o.mode), timer: QUICK_TIMER, open: 'quick' })) return code
      entries.delete(code)
    }
    return undefined
  }
}
```

- [ ] **Step 5: `RoomObject.ts`.**

```ts
import { PROTOCOL_VERSION, SEATS, type ClientMessage, type ErrorCode, type Listing, type Openness, type RoomInfo, type Settings, type TurnTimer } from '@ludo/engine'
import type { Directory } from './Directory'
import { createRoom, DAY, recover, reduce, relist, type Input, type Room, type Step } from './room'

export type Env = { ROOMS: DurableObjectNamespace<RoomObject>; DIRECTORY: DurableObjectNamespace<Directory>; CREATE_LIMIT: RateLimit }
```

`create` takes `open?: Openness` in its argument and, after saving, publishes:

```ts
  async create(o: { code: string; device: string; name: string; settings: Settings; timer: TurnTimer; open?: Openness }): Promise<boolean> {
    if (await this.load()) return false
    const now = Date.now()
    this.room = createRoom({ ...o, now })
    const listing = relist(this.room, now)
    await this.ctx.storage.put('room', this.room)
    await this.ctx.storage.setAlarm(this.room.lastActive + DAY)
    this.publish(listing)
    return true
  }
```

Add:

```ts
  /** Tell the directory about this room, without waiting. A lost update is sent again with the next change or the 10-minute refresh. */
  private publish(listing: Listing | null | undefined): void {
    if (listing === undefined || !this.room) return
    const code = this.room.code
    const directory = this.env.DIRECTORY.get(this.env.DIRECTORY.idFromName('open'))
    this.ctx.waitUntil(directory.put(code, listing).catch((error: unknown) => console.warn(`room ${code}: the directory missed a listing`, error)))
  }
```

In `apply`: in the `step.remove` branch, call `this.publish(step.listing)` before `this.room = null`. After saving a normal step, call `this.publish(step.listing)`. Note the alarm set after `create` stays `lastActive + DAY`; the first `reduce` will move it earlier for the listing refresh, which is fine since a listing refresh only matters for a room that's alive.

- [ ] **Step 6: `index.ts`.**

```ts
import type { Env } from './RoomObject'
import { cleanName, makeCode, validCode, validDevice, validMode, validSettings, validTimer } from './validate'

export { Directory } from './Directory'
export { RoomObject } from './RoomObject'

const MAX_BODY = 4096

const json = (body: unknown, status = 200) => Response.json(body, { status })
const notFound = () => json({ error: 'not_found' }, 404)
const directory = (env: Env) => env.DIRECTORY.get(env.DIRECTORY.idFromName('open'))

/** /api/rooms (create), /api/rooms/:code (look up), /api/rooms/:code/socket (play), /api/open (the list), /api/quick (quick match). Everything else is static assets. */
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const [api, what, rawCode, socket] = new URL(request.url).pathname.split('/').filter(Boolean)
    if (api !== 'api') return notFound()
    if (what === 'open' && !rawCode && request.method === 'GET') return listOpen(env)
    if (what === 'quick' && !rawCode && request.method === 'POST') return quick(request, env)
    if (what !== 'rooms') return notFound()
    if (!rawCode) return request.method === 'POST' ? create(request, env) : notFound()
    const code = rawCode.toUpperCase()
    if (!validCode(code)) return notFound()
    const room = env.ROOMS.get(env.ROOMS.idFromName(code))
    if (socket === 'socket' && request.headers.get('Upgrade') === 'websocket') return room.fetch(request)
    if (!socket && request.method === 'GET') {
      const info = await room.info()
      return info ? json(info) : notFound()
    }
    return notFound()
  },
} satisfies ExportedHandler<Env>

/** The body as an object, or null when it's too big or not JSON. */
async function readBody(request: Request): Promise<Record<string, unknown> | null> {
  if (Number(request.headers.get('Content-Length')) > MAX_BODY) return null
  const text = await request.text()
  if (text.length > MAX_BODY) return null
  try {
    const body = JSON.parse(text)
    return typeof body === 'object' && body !== null ? body : null
  } catch {
    return null
  }
}

/** Making rooms: 3 a minute per address. */
const allowed = async (request: Request, env: Env) =>
  (await env.CREATE_LIMIT.limit({ key: request.headers.get('CF-Connecting-IP') ?? 'local' })).success

async function create(request: Request, env: Env): Promise<Response> {
  if (!(await allowed(request, env))) return json({ error: 'too_fast' }, 429)
  const body = await readBody(request)
  const name = cleanName(body?.name)
  if (!body || !validDevice(body.device) || !name || !validSettings(body.settings) || !validTimer(body.timer) || (body.open !== undefined && typeof body.open !== 'boolean')) {
    return json({ error: 'bad_request' }, 400)
  }
  // A clash with a live room is rare (23^4 codes); try a few times.
  for (let i = 0; i < 5; i++) {
    const code = makeCode(Math.random)
    const made = await env.ROOMS.get(env.ROOMS.idFromName(code)).create({ code, device: body.device, name, settings: body.settings, timer: body.timer, open: body.open ? 'hosted' : undefined })
    if (made) return json({ code })
  }
  return json({ error: 'busy' }, 503)
}

async function listOpen(env: Env): Promise<Response> {
  try {
    return json({ rooms: await directory(env).list() })
  } catch (error) {
    console.error(`directory: list failed: ${error instanceof Error ? error.stack : String(error)}`)
    return json({ error: 'busy' }, 503)
  }
}

/** A room that fits, or a new one: only a new one counts against the address's limit. */
async function quick(request: Request, env: Env): Promise<Response> {
  const body = await readBody(request)
  const name = cleanName(body?.name)
  if (!body || !validDevice(body.device) || !name || !validMode(body.mode) || (body.skip !== undefined && !validCode(body.skip))) {
    return json({ error: 'bad_request' }, 400)
  }
  const o = { device: body.device, mode: body.mode, skip: body.skip }
  try {
    const found = await directory(env).quick(o)
    if (found) return json({ code: found })
    if (!(await allowed(request, env))) return json({ error: 'too_fast' }, 429)
    const code = await directory(env).make({ ...o, name })
    return code ? json({ code }) : json({ error: 'busy' }, 503)
  } catch (error) {
    console.error(`directory: quick match failed: ${error instanceof Error ? error.stack : String(error)}`)
    return json({ error: 'busy' }, 503)
  }
}
```

(The create rate limit now runs before the body is read, as before: the old code checked it first too.)

- [ ] **Step 7: Run.** `npm test -w @ludo/server && npm run typecheck -w @ludo/server` → pass.

- [ ] **Step 8: Commit.**

```bash
git add packages/server
git commit -m "feat(server): the directory of open rooms, the open list and quick match endpoints"
```

---

### Task 7: Web: Who can join, the quick lobby and quick results

**Goal:** Rooms can be made open, quick rooms show their countdowns, and the client compiles against the new protocol.

**Files:**
- Create: `packages/web/src/online/useSecondsLeft.ts`, `packages/web/src/online/useSecondsLeft.test.ts`
- Modify: `packages/web/src/online/api.ts`, `packages/web/src/labels.ts`, `packages/web/src/online/useOnlineGame.ts`, `packages/web/src/screens/Setup.tsx`, `packages/web/src/online/Lobby.tsx`, `packages/web/src/online/OnlineResults.tsx`, `packages/web/src/online/OnlineGame.tsx`, `packages/web/src/online/RoomScreen.tsx`, `packages/web/src/App.tsx`, `packages/web/src/styles.css`
- Test: `Setup.test.tsx`, `Lobby.test.tsx`, `OnlineResults.test.tsx`, `RoomScreen.test.tsx`, `App.test.tsx`

**Acceptance Criteria:**
- [ ] Create a room and Room settings have **Who can join: Friends with the code / Anyone** (Friends by default); the choice is sent as `open` on create and in `settings`.
- [ ] The lobby shows an "Open" tag next to the code for hosted open rooms, and a Who can join row.
- [ ] A quick lobby has no seat buttons, no Change settings and no Start; it shows "Starting in N s, computers fill empty seats", or "Waiting for players" with no countdown.
- [ ] Quick results show "Next game in N s" and **Leave**, no Rematch.
- [ ] `Clock` has `startAt` and `rematchAt` (local times).

**Verify:** `npm test -w @ludo/web && npm run typecheck -w @ludo/web` → pass.

**Steps:**

- [ ] **Step 1: `useSecondsLeft`.** Test first (`useSecondsLeft.test.ts`):

```ts
import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useSecondsLeft } from './useSecondsLeft'

describe('useSecondsLeft', () => {
  afterEach(() => vi.useRealTimers())

  it('counts whole seconds down to the time, and stops at 0', () => {
    vi.useFakeTimers()
    const at = Date.now() + 2500
    const { result } = renderHook(() => useSecondsLeft(at))
    expect(result.current).toBe(3)
    act(() => vi.advanceTimersByTime(1000))
    expect(result.current).toBe(2)
    act(() => vi.advanceTimersByTime(5000))
    expect(result.current).toBe(0)
  })

  it('is undefined without a time', () => {
    expect(renderHook(() => useSecondsLeft(undefined)).result.current).toBeUndefined()
  })
})
```

```ts
import { useEffect, useState } from 'react'

/** Whole seconds until `at` (a local time), ticking down; undefined without one. */
export function useSecondsLeft(at: number | undefined): number | undefined {
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    if (at === undefined) return
    setNow(Date.now())
    const timer = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(timer)
  }, [at])
  return at === undefined ? undefined : Math.max(0, Math.ceil((at - now) / 1000))
}
```

- [ ] **Step 2: The clock's countdowns.** In `useOnlineGame.ts`:

```ts
export type Clock = { deadline?: number; startAt?: number; rematchAt?: number; paused: boolean; pausedFor?: Color; covering: Color[] }

const at = (ms: number | undefined) => (ms === undefined ? undefined : Date.now() + ms)
/** The room's times are milliseconds left, so device clocks that disagree don't matter. */
const clockFrom = (times: { deadlineIn?: number; startIn?: number; rematchIn?: number }, rest: Omit<Clock, 'deadline' | 'startAt' | 'rematchAt'>): Clock => ({
  ...rest,
  deadline: at(times.deadlineIn),
  startAt: at(times.startIn),
  rematchAt: at(times.rematchIn),
})
```

The `room` case calls `clockFrom(r, { paused: r.paused, pausedFor: r.pausedFor, covering: r.covering })`, and the `clock` case `clockFrom(msg, { paused: msg.paused, pausedFor: msg.pausedFor, covering: msg.covering })`.

- [ ] **Step 3: Labels and the API.** `labels.ts`:

```ts
/** Who can join, as the room screens say it. */
export const WHO_CAN_JOIN = [
  ['friends', 'Friends with the code', 'Only people you share the code or link with'],
  ['anyone', 'Anyone', 'Listed in Find a game for anyone to join'],
] as const
export const whoCanJoinName = (open: boolean): string => nameIn(WHO_CAN_JOIN, open ? 'anyone' : 'friends')
```

(`nameIn` is the existing helper behind `timerName`; check its signature fits `WHO_CAN_JOIN`.)

`api.ts`: `createRoom`'s body type gains `open: boolean`.

- [ ] **Step 4: Setup.** In `Setup.tsx`, `online.initial` gains `open: boolean`, and `onCreate` becomes `(settings: Settings, timer: TurnTimer, open: boolean) => void`. Add `'join'` to the `Open` union, state `const [anyone, setAnyone] = useState(initial?.open ?? false)`, and after the timer row:

```tsx
        {online && pickerRow('join', 'Who can join', labelOf(WHO_CAN_JOIN, anyone ? 'anyone' : 'friends'))}
```

```tsx
      {open === 'join' && <Picker title="Who can join" options={WHO_CAN_JOIN} value={anyone ? 'anyone' : 'friends'} onPick={(v) => setAnyone(v === 'anyone')} onClose={close} />}
```

The submit calls `online.onCreate({ players, endCondition, rules, afterKick }, timer, anyone)`.

Test (add to `Setup.test.tsx`, following its existing online render helper):

```tsx
  it('online: Who can join is Friends with the code until changed, and is sent on create', async () => {
    const onCreate = vi.fn()
    // render Setup with online={{ submitLabel: 'Create room', onCreate }} as the other online tests do
    expect(screen.getByRole('button', { name: /^Who can join/ })).toHaveTextContent('Friends with the code')
    await userEvent.click(screen.getByRole('button', { name: /^Who can join/ }))
    await userEvent.click(screen.getByRole('radio', { name: 'Anyone' }))
    await userEvent.click(screen.getByRole('button', { name: 'Create room' }))
    expect(onCreate).toHaveBeenCalledWith(expect.anything(), 'normal', true)
  })
```

Update the existing `onCreate` expectations in `Setup.test.tsx` to include the third argument `false`.

- [ ] **Step 5: App and RoomScreen.** `App.tsx`: `create(settings, timer, open)` passes `open` to `createRoom`. `RoomScreen.tsx`: `initial: { settings: room.settings, timer: room.timer, open: room.open === 'hosted' }`, and `onCreate: (settings, timer, open) => { online.send({ t: 'settings', settings, timer, open }); setEditing(false) }`. Pass `startAt={online.clock.startAt}` to `Lobby`. Update `RoomScreen.test.tsx:139` to expect `open: false`, and the `createRoom` expectation in `App.test.tsx` to include `open: false`.

- [ ] **Step 6: Lobby.** Tests first, added to `Lobby.test.tsx` (`renderLobby` gains an optional `startAt` passed through):

```tsx
  it('a room open to anyone says so by its code', () => {
    renderLobby({ ...room([ama]), open: 'hosted' }, { id: 1, seat: 'red', host: true })
    expect(screen.getByText('Open')).toBeInTheDocument()
    expect(screen.getByText('Anyone')).toBeInTheDocument()
  })

  it('a quick room has no seat buttons, settings to change or Start, and counts down', () => {
    vi.useFakeTimers()
    renderLobby({ ...room([ama, kofi]), open: 'quick', host: 0 }, { id: 2, seat: 'green', host: false }, 'open', Date.now() + 14_000)
    expect(screen.queryByRole('button', { name: /Tap to sit|Stand up|Change settings|Start/ })).toBeNull()
    expect(screen.getByText('Starting in 14 s, computers fill empty seats')).toBeInTheDocument()
    act(() => vi.advanceTimersByTime(4000))
    expect(screen.getByText('Starting in 10 s, computers fill empty seats')).toBeInTheDocument()
  })

  it('a quick room with no countdown waits for players', () => {
    renderLobby({ ...room([]), open: 'quick', host: 0 }, { id: 2, host: false })
    expect(screen.getByText('Waiting for players')).toBeInTheDocument()
  })
```

Then in `Lobby.tsx`: add `startAt?: number` to `Props`; `const quick = room.open === 'quick'`; `const seconds = useSecondsLeft(startAt)`.
- Code label: `<p className="room-code-label">Room code{room.open === 'hosted' && <span className="open-tag">Open</span>}</p>`.
- Seat buttons: wrap both branches in `!quick && (…)`.
- Settings section: add a row before `Turn timer` when not quick:

```tsx
        {!quick && (
          <p className="row">
            <span className="row-label">Who can join</span>
            <span className="row-value">{whoCanJoinName(room.open === 'hosted')}</span>
          </p>
        )}
```

- The Change settings button already needs `you.host`, which is false in a quick room.
- The bottom:

```tsx
      {quick ? (
        <p className="lobby-waiting" role="status">
          {seconds === undefined ? 'Waiting for players' : `Starting in ${seconds} s, computers fill empty seats`}
        </p>
      ) : you.host ? (
        …Start as now…
      ) : (
        <p className="lobby-waiting">Waiting for {host?.name ?? 'the host'} to start</p>
      )}
```

- [ ] **Step 7: Quick results.** Test in `OnlineResults.test.tsx`:

```tsx
  it('a quick room has no Rematch: the next game starts by itself', () => {
    vi.useFakeTimers()
    render(<OnlineResults game={game()} names={names} host={false} quick nextAt={Date.now() + 12_000} onRematch={vi.fn()} onLeave={vi.fn()} />)
    expect(screen.queryByRole('button', { name: 'Rematch' })).toBeNull()
    expect(screen.getByText('Next game in 12 s')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Leave' })).toBeInTheDocument()
    vi.useRealTimers()
  })
```

`OnlineResults.tsx`: props gain `quick?: boolean; nextAt?: number`; `const seconds = useSecondsLeft(nextAt)`; the actions become:

```tsx
        {quick ? (
          <p className="results-waiting">{seconds === undefined ? 'Next game soon' : `Next game in ${seconds} s`}</p>
        ) : host ? (
          …Rematch…
        ) : (
          …Waiting for…
        )}
```

`OnlineGame.tsx` passes `quick={room.open === 'quick'} nextAt={clock.rematchAt}` to `OnlineResults`.

- [ ] **Step 8: CSS.** In `styles.css`, near `.room-code`:

```css
.open-tag { margin-left: 8px; padding: 1px 8px; border-radius: 999px; background: var(--accent); color: var(--on-accent); font-size: 12px; font-weight: 800; vertical-align: 1px; }
```

(Use whatever accent tokens `styles.css` already defines; check `:root` for the names.)

- [ ] **Step 9: Run.** `npm test -w @ludo/web && npm run typecheck` (whole repo) → pass.

- [ ] **Step 10: Commit.**

```bash
git add packages/web
git commit -m "feat(web): Who can join, the quick lobby's countdown and the quick results"
```

---

### Task 8: Web: Home leads with online

**Goal:** Home offers Quick match, Find a game and Play with friends first, then the local game. Every online button asks for a name first when none is saved.

**Files:**
- Modify: `packages/web/src/screens/Home.tsx`, `packages/web/src/online/PlayOnline.tsx`, `packages/web/src/App.tsx`, `packages/web/src/styles.css`
- Test: `packages/web/src/screens/Home.test.tsx`, `packages/web/src/online/PlayOnline.test.tsx`, `packages/web/src/App.test.tsx`, `packages/web/e2e/online.spec.ts`

**Acceptance Criteria:**
- [ ] Home's buttons, in order: Quick match (primary), Find a game, Play with friends, then under "On this device": Continue (saved game only) and New game.
- [ ] Play with friends opens the create-or-join choice, titled "Play with friends". The old Play online button is gone.
- [ ] With no saved name, each online button goes to the name step first, then on to where it was going. A room link works as before.
- [ ] Screens `quick` and `find` exist in `App` (filled in by Tasks 9 and 10; until then each renders a placeholder only in this task's diff, replaced in the next).

**Verify:** `npm test -w @ludo/web` → pass.

**Steps:**

- [ ] **Step 1: Home test.** Replace `Home.test.tsx`'s helper and the button tests:

```tsx
const calls = () => ({ onQuick: vi.fn(), onFind: vi.fn(), onFriends: vi.fn(), onNew: vi.fn(), onContinue: vi.fn() })
const renderHome = (canContinue: boolean, c = calls()) => {
  render(<Home canContinue={canContinue} hand="right" {...c} />)
  return c
}

  it('leads with online play, then the game on this device', () => {
    renderHome(true)
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual(['Quick match', 'Find a game', 'Play with friends', 'Continue', 'New game'])
    expect(screen.getByRole('button', { name: 'Quick match' })).toHaveClass('primary')
    expect(screen.getByRole('heading', { name: 'On this device' })).toBeInTheDocument()
  })

  it('each button goes where it says', async () => {
    const c = renderHome(true)
    for (const [name, fn] of [['Quick match', c.onQuick], ['Find a game', c.onFind], ['Play with friends', c.onFriends], ['Continue', c.onContinue], ['New game', c.onNew]] as const) {
      await userEvent.click(screen.getByRole('button', { name }))
      expect(fn).toHaveBeenCalled()
    }
  })
```

Keep the title, Continue-only-when-saved and static-board tests, updated to the new props and button list (the board follows the last button, New game).

- [ ] **Step 2: `Home.tsx`.**

```tsx
type Props = { canContinue: boolean; hand: Hand; onQuick: () => void; onFind: () => void; onFriends: () => void; onNew: () => void; onContinue: () => void }

export function Home({ canContinue, hand, onQuick, onFind, onFriends, onNew, onContinue }: Props) {
  return (
    <main className="screen home">
      <h1>Ludo Unlimited</h1>
      <p>Ludo with Ghanaian kicks.</p>
      <div className="home-actions">
        <button type="button" className="primary" onClick={onQuick}>
          Quick match
        </button>
        <button type="button" className="secondary" onClick={onFind}>
          Find a game
        </button>
        <button type="button" className="secondary" onClick={onFriends}>
          Play with friends
        </button>
        <h2 className="home-local">On this device</h2>
        {canContinue && (
          <button type="button" className="secondary" onClick={onContinue}>
            Continue
          </button>
        )}
        <button type="button" className="secondary" onClick={onNew}>
          New game
        </button>
      </div>
      <div className="home-board" aria-hidden="true">
        <Board state={START} turn={quarterTurns('red', hand)} />
      </div>
    </main>
  )
}
```

CSS: `.home-local { margin: 14px 0 0; font-size: 13px; font-weight: 800; color: var(--muted); text-align: center; }`

- [ ] **Step 3: `PlayOnline`.** Replace the name step's `else onStep('choice')` with a new prop `onNamed: () => void` (`if (linked) onJoin(linked) else onNamed()`). The heading: `{step === 'code' ? 'Join a room' : step === 'choice' ? 'Play with friends' : 'Play online'}`. In `PlayOnline.test.tsx`, `Steps` passes `onNamed={() => setStep('choice')}`, and the "moves to the choice" test also expects the heading "Play with friends".

- [ ] **Step 4: `App.tsx`.** Screens:

```ts
type Dest = 'quick' | 'find' | 'choice'
  /** `code`: the room a link opened, joined once there's a name. `then`: where to go once there is one. */
  | { name: 'online'; step: Step; code?: string; then?: Dest }
  | { name: 'quick'; error?: string; request?: number }
  | { name: 'find' }
```

`routeOf` maps `quick` to `{ name: 'quick' }`, like `create`. Add:

```ts
  const goTo = (dest: Dest) => go(dest === 'quick' ? { name: 'quick' } : dest === 'find' ? { name: 'find' } : { name: 'online', step: 'choice' })
  // Online play needs a name first.
  const online = (dest: Dest) => (name.trim() ? goTo(dest) : go({ name: 'online', step: 'name', then: dest }))
```

Home gets `onQuick={() => online('quick')} onFind={() => online('find')} onFriends={() => online('choice')}`. `PlayOnline` gets `onNamed={() => goTo(screen.then ?? 'choice')}`. Until Tasks 9 and 10, `case 'quick'` and `case 'find'` render `<main className="screen message"><p>Coming soon</p></main>`.

Test in `App.test.tsx`:

```tsx
  it('asks for a name before going online, then goes where you were going', async () => {
    const user = userEvent.setup()
    renderApp()
    await user.click(screen.getByRole('button', { name: 'Play with friends' }))
    await user.type(screen.getByRole('textbox', { name: 'Your name' }), 'Ama')
    await user.click(screen.getByRole('button', { name: 'Next' }))
    expect(screen.getByRole('heading', { name: 'Play with friends' })).toBeInTheDocument()
  })
```

Replace every `getByRole('button', { name: 'Play online' })` in `App.test.tsx` and `e2e/online.spec.ts` with `'Play with friends'`; where a test expects the `Play online` heading after that click, it now gets the name step (heading "Play online") or the choice ("Play with friends").

- [ ] **Step 5: Run.** `npm test -w @ludo/web && npm run typecheck -w @ludo/web` → pass.

- [ ] **Step 6: Commit.**

```bash
git add packages/web
git commit -m "feat(web): Home leads with Quick match, Find a game and Play with friends"
```

---

### Task 9: Web: Quick match

**Goal:** Pick a mode and go; land in a room with a seat, retrying once if the seat was lost.

**Files:**
- Create: `packages/web/src/online/QuickMatch.tsx`, `packages/web/src/online/QuickMatch.test.tsx`
- Modify: `packages/web/src/online/api.ts`, `packages/web/src/storage.ts`, `packages/web/src/labels.ts`, `packages/web/src/online/RoomScreen.tsx`, `packages/web/src/App.tsx`
- Test: `packages/web/src/storage.test.ts`, `packages/web/src/online/RoomScreen.test.tsx`, `packages/web/src/App.test.tsx`

**Acceptance Criteria:**
- [ ] The Quick match screen has a Rules row (Ghana kicks / Classic, remembered in `ludo-unlimited:quick-mode`, Ghana by default) and **Go**.
- [ ] While matching: "Finding a game…" and **Cancel**; a late answer after Cancel is ignored.
- [ ] Errors: "Too many new games. Try again in a minute." for 429, "Couldn't find a game. Check your connection and try again." otherwise, with **Try again**.
- [ ] Landing in a quick room without a seat (first room message), the app quick matches once more skipping that room; a second miss shows "Couldn't find a seat. Try again."

**Verify:** `npm test -w @ludo/web` → pass.

**Steps:**

- [ ] **Step 1: Storage, labels, API.** `storage.ts`:

```ts
const QUICK_MODE_KEY = 'ludo-unlimited:quick-mode'

export function loadQuickMode(): ModeName {
  try {
    return localStorage.getItem(QUICK_MODE_KEY) === 'classic' ? 'classic' : 'ghana'
  } catch {
    return 'ghana'
  }
}

export function saveQuickMode(mode: ModeName): void {
  try {
    localStorage.setItem(QUICK_MODE_KEY, mode)
  } catch {
    // Storage blocked: the pick lasts until the page closes.
  }
}
```

Test in `storage.test.ts`: `expect(loadQuickMode()).toBe('ghana'); saveQuickMode('classic'); expect(loadQuickMode()).toBe('classic')`.

`labels.ts`:

```ts
export const QUICK_MODES = [
  ['ghana', 'Ghana kicks', 'All kicks and the Labourer'],
  ['classic', 'Classic', 'Plain Ludo'],
] as const
```

`api.ts`:

```ts
export async function quickMatch(body: { device: string; name: string; mode: ModeName; skip?: string }): Promise<string> {
  const res = await fetch('/api/quick', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  if (!res.ok) throw new Error(res.status === 429 ? 'too_fast' : 'failed')
  return ((await res.json()) as { code: string }).code
}
```

- [ ] **Step 2: The screen, test first.** `QuickMatch.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { QuickMatch } from './QuickMatch'

const props = () => ({ mode: 'ghana' as const, onMode: vi.fn(), busy: false, onGo: vi.fn(), onCancel: vi.fn(), onBack: vi.fn() })

describe('QuickMatch', () => {
  it('picks the rules and goes', async () => {
    const p = props()
    render(<QuickMatch {...p} />)
    expect(screen.getByRole('button', { name: /^Rules/ })).toHaveTextContent('Ghana kicks')
    await userEvent.click(screen.getByRole('button', { name: /^Rules/ }))
    await userEvent.click(screen.getByRole('radio', { name: 'Classic' }))
    expect(p.onMode).toHaveBeenCalledWith('classic')
    await userEvent.click(screen.getByRole('button', { name: 'Go' }))
    expect(p.onGo).toHaveBeenCalled()
  })

  it('while finding, says so and can cancel', async () => {
    const p = props()
    render(<QuickMatch {...p} busy />)
    expect(screen.getByRole('status')).toHaveTextContent('Finding a game…')
    expect(screen.queryByRole('button', { name: 'Go' })).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(p.onCancel).toHaveBeenCalled()
  })

  it('an error offers Try again', async () => {
    const p = props()
    render(<QuickMatch {...p} error="Couldn’t find a game." />)
    expect(screen.getByRole('alert')).toHaveTextContent('Couldn’t find a game.')
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(p.onGo).toHaveBeenCalled()
  })
})
```

`QuickMatch.tsx`:

```tsx
import type { ModeName } from '@ludo/engine'
import { useState } from 'react'
import { Chevron, Picker } from '../components/Picker'
import { QUICK_MODES } from '../labels'

type Props = { mode: ModeName; onMode: (mode: ModeName) => void; busy: boolean; error?: string; onGo: () => void; onCancel: () => void; onBack: () => void }

/** Pick the rules, and the room finds a game: one with people waiting, or a new one. */
export function QuickMatch({ mode, onMode, busy, error, onGo, onCancel, onBack }: Props) {
  const [picking, setPicking] = useState(false)
  return (
    <main className="screen setup quick-match">
      <header className="setup-head">
        <button type="button" className="icon-button" aria-label="Back" onClick={onBack}>
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 4l-6 6 6 6" />
          </svg>
        </button>
        <h1>Quick match</h1>
      </header>
      {busy ? (
        <>
          <p className="quick-finding" role="status">
            Finding a game…
          </p>
          <button type="button" className="secondary" onClick={onCancel}>
            Cancel
          </button>
        </>
      ) : (
        <>
          <button type="button" className="row" aria-haspopup="dialog" onClick={() => setPicking(true)}>
            <span className="row-label">Rules</span>
            <span className="row-value">{QUICK_MODES.find(([m]) => m === mode)![1]}</span>
            <Chevron />
          </button>
          <p className="row-note setup-note">4 players, 30 s turns. Computers fill seats until people join.</p>
          {error && (
            <p role="alert" className="setup-error">
              {error}
            </p>
          )}
          <button type="button" className="primary start" onClick={onGo}>
            {error ? 'Try again' : 'Go'}
          </button>
        </>
      )}
      {picking && <Picker title="Rules" options={QUICK_MODES} value={mode} onPick={onMode} onClose={() => setPicking(false)} />}
    </main>
  )
}
```

- [ ] **Step 3: RoomScreen's no-seat check.** Prop `onNoSeat?: () => void`. In `Room`:

```tsx
  // A quick match lands you on a seat; if the first word from the room has none for you, the seat was lost.
  const judged = useRef(false)
  useEffect(() => {
    if (judged.current || !room || !you) return
    judged.current = true
    if (onNoSeat && room.open === 'quick' && !you.seat) onNoSeat()
  }, [room, you, onNoSeat])
```

Test in `RoomScreen.test.tsx`, mocking `useOnlineGame` as the file already does: with `room: { ...ROOM, open: 'quick' }, you: { id: 2, host: false }`, `onNoSeat` is called once; with `you.seat: 'green'` it isn't; without `onNoSeat` nothing happens.

- [ ] **Step 4: App.** State `const [quickMode, setQuickMode] = useState(loadQuickMode)`. The room screen gains `quick?: { mode: ModeName; retried: boolean }`. Generalise `stillHere` and add `findGame`:

```ts
  /** The answer to a request only counts if you're still waiting for that one. */
  const waitingFor = (request: number) => {
    const now = current.current
    return (now.name === 'create' || now.name === 'quick') && now.request === request
  }

  async function findGame(mode: ModeName, skip?: string) {
    const request = ++requests.current
    setScreen({ name: 'quick', request })
    try {
      const code = await quickMatch({ device, name, mode, skip })
      if (waitingFor(request)) go({ name: 'room', code, quick: { mode, retried: skip !== undefined } })
    } catch (e) {
      const error = (e as Error).message === 'too_fast' ? 'Too many new games. Try again in a minute.' : 'Couldn’t find a game. Check your connection and try again.'
      if (waitingFor(request)) setScreen({ name: 'quick', error })
    }
  }
```

`create` uses `waitingFor(request)` in place of `stillHere()`.

```tsx
    case 'quick':
      return (
        <QuickMatch
          mode={quickMode}
          onMode={(mode) => {
            saveQuickMode(mode)
            setQuickMode(mode)
          }}
          busy={screen.request !== undefined}
          error={screen.error}
          onGo={() => findGame(quickMode)}
          onCancel={() => setScreen({ name: 'quick' })}
          onBack={goBack}
        />
      )
```

The `room` case passes:

```tsx
          onNoSeat={
            screen.quick &&
            (() => (screen.quick!.retried ? go({ name: 'quick', error: 'Couldn’t find a seat. Try again.' }) : findGame(screen.quick!.mode, screen.code)))
          }
```

Tests in `App.test.tsx` (mock `quickMatch` like `createRoom`):

```tsx
  it('quick match finds a room and opens it, remembering the rules', async () => {
    vi.mocked(quickMatch).mockResolvedValue('QWRT')
    localStorage.setItem('ludo-unlimited:name', 'Ama')
    const user = userEvent.setup()
    renderApp()
    await user.click(screen.getByRole('button', { name: 'Quick match' }))
    await user.click(screen.getByRole('button', { name: /^Rules/ }))
    await user.click(screen.getByRole('radio', { name: 'Classic' }))
    await user.click(screen.getByRole('button', { name: 'Go' }))
    await waitFor(() => expect(location.pathname).toBe('/r/QWRT'))
    expect(quickMatch).toHaveBeenCalledWith({ device: expect.any(String), name: 'Ama', mode: 'classic', skip: undefined })
    expect(localStorage.getItem('ludo-unlimited:quick-mode')).toBe('classic')
  })

  it('a quick room with no seat for you is tried once more, skipping it', async () => {
    vi.mocked(quickMatch).mockResolvedValueOnce('FULL').mockResolvedValueOnce('NEXT')
    vi.mocked(useOnlineGame).mockImplementation(
      ({ code }) => ({ room: { ...lobby(code), open: 'quick' }, you: code === 'FULL' ? { id: 9, host: false } : { id: 9, seat: 'green', host: false }, status: 'open', send: vi.fn(), clock: { paused: false, covering: [] } }) as unknown as ReturnType<typeof useOnlineGame>,
    )
    localStorage.setItem('ludo-unlimited:name', 'Ama')
    const user = userEvent.setup()
    renderApp()
    await user.click(screen.getByRole('button', { name: 'Quick match' }))
    await user.click(screen.getByRole('button', { name: 'Go' }))
    await waitFor(() => expect(location.pathname).toBe('/r/NEXT'))
    expect(quickMatch).toHaveBeenLastCalledWith(expect.objectContaining({ skip: 'FULL' }))
  })
```

(`lobby(code)` is the existing room fixture in `App.test.tsx`; if the mocked hook in that file lacks `clock`, add `clock: { paused: false, covering: [] }` to its default too, since `RoomScreen` now reads `online.clock.startAt`.)

- [ ] **Step 5: Run.** `npm test -w @ludo/web && npm run typecheck -w @ludo/web` → pass.

- [ ] **Step 6: Commit.**

```bash
git add packages/web
git commit -m "feat(web): quick match: pick the rules and go, with one retry if the seat was lost"
```

---

### Task 10: Web: Find a game, the browser test and docs

**Goal:** A list of open rooms to join, a browser test of quick match and the list, and docs brought up to date.

**Files:**
- Create: `packages/web/src/online/FindGame.tsx`, `packages/web/src/online/FindGame.test.tsx`, `packages/web/e2e/quick.spec.ts`
- Modify: `packages/web/src/online/api.ts`, `packages/web/src/labels.ts`, `packages/web/src/App.tsx`, `packages/web/src/styles.css`, `README.md`, `docs/superpowers/specs/2026-11-09-open-rooms-design.md`

**Acceptance Criteria:**
- [ ] Find a game lists each open room: mode (Classic, Ghana kicks, Custom), "Quick" or "Kofi's room", "Waiting · 2 of 4" or "Playing · Green, Blue free", and the timer. Tapping opens the room.
- [ ] It refreshes every 5 s while visible, when the tab becomes visible, and with **Refresh**.
- [ ] Empty: "No open games right now" with **Quick match**. Error: "Couldn't load games" with **Try again**. Loading: "Looking for games…".
- [ ] `quick.spec.ts`: two browsers quick match Classic into the same room and the game starts; a third finds it in Find a game, opens it, and is seated (not watching).
- [ ] README documents `/api/open`, `/api/quick` and the Directory; the spec lists the planning refinements.

**Verify:** `npm test && npm run typecheck && npm run e2e -w @ludo/web` → all pass.

**Steps:**

- [ ] **Step 1: API and labels.** `api.ts`:

```ts
export async function openRooms(): Promise<Listing[]> {
  const res = await fetch('/api/open')
  if (!res.ok) throw new Error('failed')
  return ((await res.json()) as { rooms: Listing[] }).rooms
}
```

`labels.ts`:

```ts
export const LISTED_MODE_NAME: Record<Listing['mode'], string> = { classic: 'Classic', ghana: 'Ghana kicks', custom: 'Custom' }

/** "Waiting · 2 of 4" or "Playing · Green, Blue free". */
export const listingStatus = (l: Listing): string =>
  l.phase === 'lobby' ? `Waiting · ${l.humans} of ${l.players}` : `Playing · ${l.computerSeats.map((c) => COLOR_NAME[c]).join(', ')} free`
```

with tests in `labels.test.ts` for both forms.

- [ ] **Step 2: The screen, test first.** `FindGame.test.tsx`:

```tsx
import type { Listing } from '@ludo/engine'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FindGame } from './FindGame'

const quickLobby: Listing = { code: 'QWRT', kind: 'quick', mode: 'ghana', phase: 'lobby', players: 4, humans: 2, seatsFree: 2, computerSeats: [], timer: 'normal' }
const hostedGame: Listing = { code: 'KQMZ', kind: 'hosted', mode: 'custom', phase: 'playing', players: 4, humans: 2, seatsFree: 0, computerSeats: ['green', 'blue'], timer: 'quick', host: 'Kofi' }

const renderFind = (load: () => Promise<Listing[]>) => {
  const onOpen = vi.fn()
  const onQuick = vi.fn()
  render(<FindGame load={load} onOpen={onOpen} onQuick={onQuick} onBack={vi.fn()} />)
  return { onOpen, onQuick }
}

describe('FindGame', () => {
  afterEach(() => vi.useRealTimers())

  it('lists the open rooms, and opens one', async () => {
    const { onOpen } = renderFind(async () => [quickLobby, hostedGame])
    const rows = await screen.findAllByTestId('listing')
    expect(rows.map((r) => r.textContent)).toEqual(['Ghana kicks · QuickWaiting · 2 of 4 · Normal', 'Custom · Kofi’s roomPlaying · Green, Blue free · Quick'])
    await userEvent.click(rows[1])
    expect(onOpen).toHaveBeenCalledWith('KQMZ')
  })

  it('with none, offers Quick match', async () => {
    const { onQuick } = renderFind(async () => [])
    await userEvent.click(await screen.findByRole('button', { name: 'Quick match' }))
    expect(screen.getByText('No open games right now')).toBeInTheDocument()
    expect(onQuick).toHaveBeenCalled()
  })

  it('a failed load offers Try again', async () => {
    const load = vi.fn().mockRejectedValueOnce(new Error('failed')).mockResolvedValue([quickLobby])
    renderFind(load)
    await userEvent.click(await screen.findByRole('button', { name: 'Try again' }))
    expect(await screen.findAllByTestId('listing')).toHaveLength(1)
  })

  it('refreshes every 5 s', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const load = vi.fn().mockResolvedValue([])
    renderFind(load)
    await act(async () => vi.advanceTimersByTimeAsync(5000))
    expect(load).toHaveBeenCalledTimes(2)
  })
})
```

(The row text depends on `timerName` returning "Normal" and "Quick"; adjust to the `TIMERS` labels if they differ.)

`FindGame.tsx`:

```tsx
import type { Listing } from '@ludo/engine'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Chevron } from '../components/Picker'
import { LISTED_MODE_NAME, listingStatus, timerName } from '../labels'
import { openRooms } from './api'

const REFRESH_MS = 5000

type Props = { load?: () => Promise<Listing[]>; onOpen: (code: string) => void; onQuick: () => void; onBack: () => void }

/** The open rooms someone could play in, kept fresh while on screen. */
export function FindGame({ load = openRooms, onOpen, onQuick, onBack }: Props) {
  const [rooms, setRooms] = useState<Listing[]>()
  const [failed, setFailed] = useState(false)
  // Only the latest answer counts, and none after leaving.
  const latest = useRef(0)

  const refresh = useCallback(async () => {
    const request = ++latest.current
    try {
      const next = await load()
      if (request !== latest.current) return
      setRooms(next)
      setFailed(false)
    } catch {
      if (request === latest.current) setFailed(true)
    }
  }, [load])

  useEffect(() => {
    void refresh()
    const visible = () => document.visibilityState === 'visible'
    const timer = setInterval(() => visible() && void refresh(), REFRESH_MS)
    const onVisible = () => visible() && void refresh()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
      latest.current += 1
    }
  }, [refresh])

  return (
    <main className="screen setup find-game">
      <header className="setup-head">
        <button type="button" className="icon-button" aria-label="Back" onClick={onBack}>
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 4l-6 6 6 6" />
          </svg>
        </button>
        <h1>Find a game</h1>
      </header>
      {failed && (
        <div className="find-problem" role="alert">
          <p>Couldn’t load games</p>
          <button type="button" className="secondary" onClick={() => void refresh()}>
            Try again
          </button>
        </div>
      )}
      {!rooms && !failed && <p role="status">Looking for games…</p>}
      {rooms?.length === 0 && (
        <>
          <p className="find-empty">No open games right now</p>
          <button type="button" className="primary" onClick={onQuick}>
            Quick match
          </button>
        </>
      )}
      {rooms && rooms.length > 0 && (
        <>
          {rooms.map((l) => (
            <button key={l.code} type="button" className="row" data-testid="listing" onClick={() => onOpen(l.code)}>
              <span className="row-text">
                <span>
                  {LISTED_MODE_NAME[l.mode]} · {l.kind === 'quick' ? 'Quick' : `${l.host ?? 'Someone'}’s room`}
                </span>
                <span className="row-note">
                  {listingStatus(l)} · {timerName(l.timer)}
                </span>
              </span>
              <Chevron />
            </button>
          ))}
          <button type="button" className="text-button find-refresh" onClick={() => void refresh()}>
            Refresh
          </button>
        </>
      )}
    </main>
  )
}
```

CSS: `.find-empty, .find-problem p { margin: 24px 0 12px; text-align: center; color: var(--muted); }` and `.find-refresh { margin: 12px auto 0; display: block; }`.

- [ ] **Step 3: App.** Replace the `find` placeholder:

```tsx
    case 'find':
      return <FindGame onOpen={(code) => go({ name: 'room', code })} onQuick={() => go({ name: 'quick' })} onBack={goBack} />
```

App test: with `openRooms` mocked to return one listing, Home → Find a game (name saved) shows the row, and tapping it opens `/r/<code>`.

- [ ] **Step 4: The browser test.** Create `packages/web/e2e/quick.spec.ts`:

```ts
import { expect, test, type Page } from '@playwright/test'

const label = (page: Page) => page.locator('.turn-label')

async function quickMatch(page: Page, name: string) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Quick match' }).click()
  await page.getByLabel('Your name').fill(name)
  await page.getByRole('button', { name: 'Next' }).click()
  await page.getByRole('button', { name: /^Rules/ }).click()
  await page.getByRole('radio', { name: 'Classic' }).click()
  await page.getByRole('button', { name: 'Go' }).click()
}

test('two people quick match into one room, and a third finds it', async ({ browser }) => {
  const a = await (await browser.newContext()).newPage()
  const b = await (await browser.newContext()).newPage()
  const c = await (await browser.newContext()).newPage()

  await quickMatch(a, 'Ama')
  await expect(a.getByText(/Starting in \d+ s/)).toBeVisible({ timeout: 15_000 })
  await quickMatch(b, 'Kofi')

  // Both in one room: each sees the other, and the game starts by itself.
  await expect(a.getByText(/Kofi/).first()).toBeVisible({ timeout: 15_000 })
  await expect(b.getByText(/Ama/).first()).toBeVisible()
  await expect(label(a)).toBeVisible({ timeout: 40_000 })
  await expect(label(b)).toBeVisible({ timeout: 40_000 })

  // Esi finds it in the list and gets a computer's seat.
  await c.goto('/')
  await c.getByRole('button', { name: 'Find a game' }).click()
  await c.getByLabel('Your name').fill('Esi')
  await c.getByRole('button', { name: 'Next' }).click()
  const row = c.getByTestId('listing').filter({ hasText: 'Classic · Quick' }).filter({ hasText: 'Playing' }).first()
  await row.click({ timeout: 15_000 })
  await expect(label(c)).toBeVisible({ timeout: 15_000 })
  await expect(label(c)).not.toHaveText(/Watching/, { timeout: 15_000 })
})
```

(Run locally with a fresh `wrangler dev`: rooms from an earlier run can be picked, since the directory keeps them for 30 minutes. In CI the servers start fresh.)

- [ ] **Step 5: Docs.** In `README.md`, under the server package line, add: "One `Directory` Durable Object keeps the open rooms: `GET /api/open` lists them and `POST /api/quick` finds or makes a quick room. Its migration (`v2`) runs on the next deploy; the Workers Builds settings don't change." In the spec, add a "Refinements made while planning" section with the five refinements from the top of this plan, and update the Screens and Room kinds text to match (quick rooms seat arrivals in games too; Refresh instead of pull-down; the countdown restarts for the next arrival).

- [ ] **Step 6: Run.** `npm test && npm run typecheck && npm run e2e -w @ludo/web` → pass.

- [ ] **Step 7: Commit.**

```bash
git add packages/web README.md docs/superpowers/specs/2026-11-09-open-rooms-design.md
git commit -m "feat(web): Find a game; test(e2e): quick match and the room list; docs: open rooms"
```

---

### Task 11: The user plays it

**Goal:** The user confirms quick match and the room list work across real devices.

**Files:** none.

**Acceptance Criteria:**
- [ ] The user quick matches on two devices and lands in the same room; the game starts by itself.
- [ ] The user sees an open room in Find a game and joins it.

**Verify:** the user's answer below.

**Steps:**

- [ ] **Step 1:** Tell the user how to try it: either the local dev servers on their LAN (`npm run dev -w @ludo/server` and `npm run dev -w @ludo/web -- --host`), or a deploy after they push. Remind them that nothing has been pushed.

**User Verification Required:**
Before marking this task complete, you MUST call AskUserQuestion:
```yaml
AskUserQuestion:
  question: "Did quick match put both devices in the same game, and could you join an open room from Find a game?"
  header: "Verification"
  options:
    - label: "Works"
      description: "Both landed in one room, the game started by itself, and Find a game worked"
    - label: "Something's off"
      description: "Describe what happened; it gets fixed and checked again"
```

**If the user selects the negative option:** the task is not complete. Fix what they found, then ask again.
