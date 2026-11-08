# Ludo Unlimited — Online Rooms Design

**Date:** 2026-11-08
**Depends on:**
- `packages/engine` (rules engine, see `2026-11-07-rules-engine-design.md`)
- `packages/web` (board UI, see `2026-11-08-board-ui-design.md` and `2026-11-08-ui-redesign.md`)

**Delivery:** two steps.
- **Step 1 (this spec):** private rooms. Create a room, share a link or code, friends join, the host starts.
- **Step 2 (later spec):** open rooms and a queue.
  - A host can mark a room open, and open rooms are listed for anyone to join.
  - Quick match drops a player into an open room with a free seat that fits what they asked for, or opens a new one.
  - Both use the rooms built here. Step 1 must not need reworking for them.

## Goal

Friends play Ludo Unlimited together on their own devices. Every house rule and setting works online exactly as it does on one device. Nobody can cheat the dice, and a slow or dropped player never stalls the game.

## Scope

**In:**
- Private rooms with a 4-letter code and a link.
- A nickname saved on the device. No accounts.
- A room screen before the game: seats, sharing and the host's settings.
- The host starts the game, filling empty seats with computers or playing with whoever is there.
- A turn timer the host picks; the computer plays for anyone whose time runs out or who disconnects.
- Pausing, reconnecting, and the host role passing on.
- Quick reactions, rematch and watching a game.

**Out (later specs):**
- Open rooms, the room list and the queue (step 2).
- Text chat.
- Accounts, friends lists and history.
- More computer difficulty levels.

## Architecture

**Approach:** the server runs the game. Each room is a Cloudflare Durable Object that:
- holds the game
- rolls the dice
- checks every action with the rules engine
- runs the computers and the timers

Devices only send what the person wants to do, and draw what the room tells them.

**One Worker.** The `ludo-unlimited` Worker that serves the app also serves `/api/*`.
- **New package `packages/server`:** the Worker entry, the `Room` Durable Object and the room logic.
- **Config:** `packages/server/wrangler.jsonc` replaces `packages/web/wrangler.jsonc`.
  - It keeps the same name, custom domain and settings.
  - Static assets point at `../web/dist`.
  - It adds `main`, the Durable Object binding and a migration.
  - `assets.run_worker_first: ["/api/*"]` sends only API calls to the Worker. Everything else is served as static files, with the single-page fallback as now.
- **Cloudflare Workers Builds settings must change with it:**
  - Build command: `npm run build -w @ludo/web`.
  - Deploy command: `npx wrangler deploy --config packages/server/wrangler.jsonc`.
- **Local development:** `wrangler dev` serves the API on its own port, and the Vite dev server proxies `/api` to it.

**Room logic is pure.** `packages/server/src/room.ts` is a reducer, `(room, input, now, random) → { room, out }`. It doesn't touch the network or storage.
- **Inputs:** a device's message, a connect or disconnect, or the alarm firing.
- **Outputs (`out`):** the messages to send, and the next alarm time.
- **The Durable Object** (`packages/server/src/RoomObject.ts`) is a thin shell around it:
  - It accepts WebSockets using the hibernation API, so idle rooms cost nothing.
  - It feeds inputs into the reducer, saves the room, sends `out` and sets the alarm.

**The engine stays the single source of the rules.** The room calls `roll`, `applyMove`, `stopRolling`, `legalMoves`, `currentMover` and `chooseMove`. It rolls dice with `crypto.getRandomValues`.
- **Mid-turn handover:** the computer finishes a turn it started, so a returning player never takes over halfway through one.
- **Untrusted moves:** a move from a device is matched against `legalMoves` by `outcomeKey`, exactly as `applyMove` already does.

**Devices replay.** Every game change is broadcast as the engine `GameEvent` with a sequence number.
- Each device applies it with the engine and derives effects with `describeRoll` and `describeMove`, as the local game does now. Callouts, sounds and animations are unchanged.
- A device that misses a number asks for a full sync and rebuilds with `replay(settings, log)`.

## Data

```ts
type RoomCode = string // 4 letters from an unambiguous set: no I, L, O, 0 or 1

type Member = {
  device: string          // random ID made once per device, kept in localStorage
  name: string            // nickname, 1–16 characters, trimmed
  connected: boolean
  seat?: Color            // missing: watching
}

type TurnTimer = 'relaxed' | 'normal' | 'quick' | 'off' // 60s, 30s, 15s, none

type Room = {
  code: RoomCode
  phase: 'lobby' | 'playing' | 'finished'
  host: string                         // device ID
  settings: Settings                   // engine settings; `players` is the host's pick, and `drop` lowers it at Start
  timer: TurnTimer
  members: Member[]
  computers: Color[]                   // seats played by the computer from the start
  covering: Color[]                    // human seats the computer is covering now (timeout or disconnect)
  paused: boolean
  log: GameEvent[]                     // the game, replayable with the engine
  seq: number                          // last event number sent
  deadline?: number                    // when the current decision times out
  lastActive: number
}
```

- **Saving:** the room is saved to Durable Object storage after every input that changes it. The game state is rebuilt with `replay(settings, log)` when the object wakes up.
- **Expiry:** the alarm deletes the room 24 hours after `lastActive`.

## Protocol

**HTTP**
- `POST /api/rooms` creates a room.
  - **Body:** `{ device, name, settings, timer }`.
  - **Reply:** `{ code }`.
  - Limited to 10 per IP address per hour (a Workers rate-limit binding).
- `GET /api/rooms/:code` gets a room's details.
  - **Reply:** `{ phase, players, seatsFree }`, or 404.
  - Not used by the app yet (the join screen connects straight away); kept for tools and tests.
- `GET /api/rooms/:code/socket?device=…&name=…&v=…` opens the WebSocket. `v` is the protocol version.

**Device → room** (JSON; anything over 2 KB is dropped)

| Message | Who | When |
|---|---|---|
| `{ t: 'sit', color }` / `{ t: 'stand' }` | anyone | lobby |
| `{ t: 'settings', settings, timer }` | host | lobby |
| `{ t: 'start', empty: 'computers' \| 'drop' }` | host | lobby, 2+ players once filled or dropped |
| `{ t: 'roll' }` / `{ t: 'move', move }` / `{ t: 'stop' }` | the seat that has to act | playing, not paused |
| `{ t: 'pause' }` / `{ t: 'resume' }` | host | playing |
| `{ t: 'react', id }` | seated players | any time; 1 per 3s |
| `{ t: 'rematch' }` | host | finished |
| `{ t: 'rename', name }` | anyone | any time |
| `{ t: 'sync' }` | anyone | any time |

**Room → device**

| Message | Meaning |
|---|---|
| `{ t: 'room', room, you }` | Full state: the room without device IDs, plus `you` (your seat or `'watching'`, and whether you host). Sent on connect, on `sync`, and after a refused action. |
| `{ t: 'event', seq, event, by }` | One game event. `by` is `'human'` or `'computer'`. |
| `{ t: 'members', members, host }` | Someone joined, left, sat, stood, renamed, connected or disconnected. |
| `{ t: 'lobby', settings, timer }` | The host changed the settings. |
| `{ t: 'deadline', at }` / `{ t: 'paused', paused }` | The turn clock, and pause. |
| `{ t: 'reaction', color, id }` | Show a reaction over that yard. |
| `{ t: 'error', code }` | `not_found`, `old_version`, `not_your_turn`, `illegal`, `too_fast`, `replaced` (opened in another tab). |

**Old versions:** when `v` doesn't match, the room sends `old_version` and closes. The app shows "Update to keep playing" and reloads, which picks up the new service worker.

## Room rules

**Lobby**
- **Joining:** the room's creator starts in the first seat (red); everyone else joins as a watcher. Tapping a free colour sits them, and `stand` frees the seat. A seat whose holder isn't connected counts as free, and Start leaves out anyone not connected.
- **Seat colours:** the lobby offers the seats for the host's player count, in the engine's seat order (`SEATS`). 2 players use red and yellow; 3 use red, green and yellow.
  - If the host lowers the count, anyone on a seat that no longer exists goes back to watching.
  - With `drop`, players are moved onto the seats of the smaller count (`SEATS[n]`), keeping each one's colour where possible, so the board matches the local game.
- **Start:** host only, needing at least 2 seated humans, or 1 human with `empty: 'computers'`.
  - `computers` fills the other seats up to the room's chosen player count.
  - `drop` sets the player count to the number of seated humans, which must be at least 2.
- **Host leaving:** the host role passes to the next connected seated player in seat order, or else to the next connected watcher.

**Playing**
- **Who acts:** the seat that has to act is `currentMover(game)` while a roll is pending, otherwise `game.turn`.
- **The clock:**
  - When a human seat has to act and the timer isn't `off`, the room sets `deadline = now + timer + animation allowance`.
  - The allowance is the time devices need to animate the last event. It uses the existing `NORMAL_TIMING`: the roll animation, plus a step per square moved, plus effect pauses. Those numbers move into a shared module so the room and the app agree.
- **Timeout:** the computer plays that one decision (roll, move or stop), and the clock starts again for the next one. The player stays in their seat and acts themselves next time.
- **Disconnect:** the seat is added to `covering`, and the computer plays its decisions straight away, still paced by the allowance. The host gets the notice.
- **Reconnect** (same device ID, or "Rejoin as …"): the seat leaves `covering` at the start of the seat's next decision, so a turn the computer is in the middle of is finished by the computer.
- **Pause:** host only. It stops the clock and computer moves until the host taps **Carry on**, or a covered player whose disconnect caused the pause comes back.
- **Nobody connected:** when no human is connected, the room pauses itself. It carries on when someone returns.
- **Computer seats:** they act after the same allowance, with the existing bot (`chooseMove`).
- **Refused actions:** an out-of-turn or illegal action, or one sent while paused, is refused with an `error`, and that device is sent the full state.

**Finished**
- **Results:** everyone sees the results.
- **Rematch** (host only): it keeps the members, seats and settings, empties the log and goes back to the lobby. Seats of players who have left are free again.

**Rejoin as …:** on a room link, any seat whose player is disconnected offers "Rejoin as Kofi". Taking it moves that seat to the new device ID. This is fine for private rooms among friends, and open rooms (step 2) will need something stricter.

## Screens

Device-only settings stay per device, as now: playing hand, theme, sound, music and effects.

- **Home:** adds **Play online** beside the local game.
- **Play online:** a nickname field (required, saved), **Create a room**, and **Join** with a 4-letter code field.
- **Create a room:** the existing New game screen without the seat rows, plus a **Turn timer** row (Relaxed / Normal / Quick / No timer, described like the other pickers). **Create** opens the room.
- **Room (lobby):**
  - The code shown large, with **Share link** (`navigator.share`, falling back to copying the link).
  - The four colours as rows: "Red: Kofi (host)", "Green: Tap to sit", with a disconnected player's dot greyed.
  - "2 watching".
  - The host sees the settings rows and **Start**. Start asks **Fill with computers** or **Play with N** when seats are empty.
  - Everyone else sees the settings read-only and "Waiting for Kofi to start".
- **Room link** `/r/KQ7M`: opens the room, asking for a nickname first if there isn't one. Unknown or expired codes show "No room with that code" or "This room has ended", with **Home**.
- **Game:** the existing game screen with these additions:
  - **Names:** the nickname on each yard, a greyed dot for a disconnected player, and "Computer" on computer seats.
  - **Turn clock:** a thin ring round the dice drains while a human seat has to act. It is most visible in the last 10 seconds.
  - **Turn label:** names the player: "Your turn" or "Kofi's turn".
  - **Reactions:** a reaction button opens 6 presets: 😂 👏 😱 🔥 "Hurry up" "Wicked!". The pick pops over the sender's yard for about 2 seconds on every screen.
  - **Host notice:** "Kofi left. A computer is playing for them", with **Pause and wait**. While paused, a bar shows "Paused, waiting for Kofi" and the host's **Carry on**.
  - **Watchers:** the same board without dice control. The label above the dice says "Watching".
  - **Connection:** "Reconnecting…" while offline. The menu's **Quit** becomes **Leave room**.
- **Results:** the existing results. The host gets **Rematch**; the others see "Waiting for host" and **Leave**.

**App code**
- **`useOnlineGame`:** a new hook that returns the same shape as `useGame`, so `GameScreen` works with either. It also returns:
  - the room, `you`, the deadline, pause, reactions, the host notice and the connection state.
- **Connection layer** (`packages/web/src/online/socket.ts`): reconnects with backoff (0.5 s doubling to 8 s) and keeps the last `seq` to detect gaps.
- **Shared code:** the animation timing moves from `useGame.ts` to the engine package as `ANIMATION_TIMING`, so the room can pace by it. The protocol types live in the engine package too, in `protocol.ts`, so both sides compile against them.

## Error handling

- **Network:** dropped connections reconnect by themselves. A sequence gap triggers `sync`, and the device rebuilds from the log.
- **Bad input:** a malformed or oversized message is ignored. An illegal or out-of-turn action gets `error` plus the full state.
- **Lost rooms:** if a room is gone (expired, or a bad code), the socket gets `not_found` and the screen offers Home.
- **Durable Object restarts:** the room is rebuilt from storage, and devices reconnect and resync.
- **Limits:** room creation is rate-limited per IP address. Reactions are limited to one every 3 seconds per device; extra ones are dropped with `too_fast`.

## Testing

- **Room logic** (`packages/server/test/room.test.ts`, Vitest, no network): join and watch, sit and stand, settings, start (fill and drop, seat remapping, the minimum players), act, out-of-turn and illegal actions, timeout, disconnect and covering, reconnect at the next decision, rejoin as, pause and resume, the self-pause when nobody is connected, host handover, reactions and their limit, rematch, expiry. A fixed clock and fixed dice make it deterministic.
- **Durable Object** (`@cloudflare/vitest-pool-workers`): create over HTTP, two WebSockets join, sit, start, play a few events in order, then disconnect and reconnect with a sync.
- **App:** `useOnlineGame` against a fake socket: events apply and animate, a gap triggers sync, the deadline shows, errors resync.
- **Browser** (Playwright, run in CI): two browser contexts. One creates a room and the other joins by code; both sit and the host starts with computers. They play turns, one disconnects and rejoins, and both see the same board.
- **Existing tests:** the local game, engine and web tests are untouched and still pass.

## Refinements made while planning

1. **Turn clock:** messages carry `deadlineIn` (milliseconds left), not a server timestamp, so device clocks that disagree don't matter.
2. **Fewer message types:** lobby changes and member changes are sent as a full personalised `room` message, instead of separate `members` and `lobby` messages. `clock` carries the deadline, pause and covering after each game event.
3. **New messages:** `{ t: 'rejoin', color }` is added for "Rejoin as …", and `pause` takes an optional `for` colour, the player being waited for.
4. **Rate limit:** Cloudflare's rate-limit binding only supports 10- or 60-second windows, so room creation is limited to 3 per minute per IP instead of 10 per hour.
5. **Away players:** a disconnected player's yard name reads "Kofi (away)", instead of using a greyed dot.
