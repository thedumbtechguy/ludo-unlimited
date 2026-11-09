# Ludo Unlimited — Open Rooms and Quick Match Design

**Date:** 2026-11-09
**Depends on:** online rooms step 1 (`2026-11-08-online-rooms-design.md`). This is its step 2.

## Goal

Strangers can find a game. Quick match puts a player into a game in the mode they want within seconds, with computers filling in until people arrive. Hosts can open their own room to anyone, and an open game list shows every room someone could play in.

## Scope

**In:**
- Quick match, choosing only the mode (Classic or Ghana kicks).
- Quick rooms that run themselves, with no host.
- An **Anyone can join** option for hosted rooms.
- A list of open rooms: lobbies with a free seat, and games with a computer seat to take.
- In open rooms, a dropped player's seat opens to others after 120 s.
- Home leads with online play; local games move below it.

**Out:**
- Text chat (reactions stay the only way to talk).
- Accounts, ratings, skill-based matching.
- Quick match by player count or timer.
- Listing full games for watching.

## Decisions

| Question | Decision |
|---|---|
| What quick match asks | The mode only. Any player count and timer. |
| Custom rules | Rooms whose rules match no mode are listed as "Custom". Quick match never uses them, or any hosted room: only quick rooms. |
| Nobody arrives | The game starts with computers 20 s after the first player arrived. The room stays listed, and newcomers take over a computer seat. |
| Who controls a quick room | Nobody. Settings come from the mode, there's no pause, and starting and rematch are automatic. |
| Hosted rooms | A host can make their room open to anyone and keeps all host powers. |
| What the list shows | Lobbies with a free seat, and games in progress with a takeable computer seat. |
| A player drops in an open room | A computer covers at once. After 120 s away, the seat becomes a computer seat anyone can take. |
| Where open rooms are tracked | One `Directory` Durable Object (D1 and KV were considered; KV is too stale for matching). |

## Server

### Room kinds

`Room` gets `open?: 'quick' | 'hosted'`. Missing means private, which works exactly as in step 1.

**Hosted** (`open: 'hosted'`): a normal room whose host chose **Anyone can join**.
- It's set at creation (`POST /api/rooms` takes `open: boolean`) and can be changed by the host in the lobby. `{ t: 'settings' }` carries `open` alongside `settings` and `timer`.
- Every step 1 rule applies, including the host's powers.

**Quick** (`open: 'quick'`): made only by quick match.
- **Settings:** `settingsFor(mode, 4, 'firstWins')`, timer `normal` (30 s).
- **No host:** `owner` and `host` are unset. Every host-only message (`settings`, `start`, `pause`, `resume`, `rematch`) is refused with `illegal`. The host rule from step 1 doesn't run.
- **Seating:** everyone who connects is seated. In the lobby that's the first free colour of `SEATS[4]`; in a game it's the first computer seat still playing, taken over as with `takeover`. `sit` and `stand` are refused. Only when there's no seat left does a newcomer watch. In the lobby, a player who disconnects gives up their seat at once.
- **Start:** when all 4 seats are taken by connected players, or 20 s after the first player was seated (`startAt`), whichever comes first. Empty seats become computers, as with `empty: 'computers'`. If nobody is connected when `startAt` comes, the countdown is cleared, and the next person seated starts a fresh 20 s.
- **No pause:** the self-pause when nobody is connected still applies, since no one is there to see it.
- **Rematch:** 15 s after devices have finished showing the last move (`rematchAt`: the final event's animation time plus 15 s), the room goes back to the lobby. Connected players keep their seats, and everyone else is removed from their seat. `startAt` is set again for 20 s later.
- **Expiry:** 24 h after `lastActive`, as now.

### Left seats in open rooms

For both open kinds, when a seated human has been disconnected for 120 s during a game:
- Their colour moves from `covering` to `computers`, so anyone can take it with `takeover`.
- The member's seat is cleared (they become a watcher), and the room records `leftSeats[color] = device`.
- When that device reconnects and the colour is still in `computers`, it's taken over for them as if they'd sent `takeover`. If someone else has it, they watch.
- `leftSeats` is cleared at rematch.

Private rooms keep step 1's rule: the seat is theirs until the end. A player who has finished keeps their seat in every kind of room: it's never released to others.

### Listings

The reducer's `Step` gets `listing: Listing | null | undefined`. Undefined means no change, and `null` means remove.

```ts
type Listing = {
  code: string
  kind: 'quick' | 'hosted'
  mode: 'classic' | 'ghana' | 'custom'   // from settings.rules and afterKick against MODES
  phase: 'lobby' | 'playing'
  players: number                       // the room's player count
  humans: number                        // seated humans
  seatsFree: number                     // lobby only
  computerSeats: Color[]                // playing only: seats a watcher can take
  timer: TurnTimer
  host?: string                         // hosted rooms: the host's name
}
```

- A room has a listing only while it's open and someone could play in it: a lobby with a free seat, or a game with a computer seat. Otherwise it's `null`. A quick room nobody is seated in isn't listed (a new one is, its creator already seated), and nor is a game nobody is connected to: a frozen game shouldn't draw people in.
- The reducer works it out after every input and includes it only when it differs from the last one sent (`room.listed`).
- `RoomObject` sends it to the directory with `ctx.waitUntil`, without waiting for a reply. While listed, the room's alarm also re-sends it every 10 minutes. A failed send is logged with `console.warn` and retried by the next change or refresh.
- Deleting a room (expiry) sends `null`.

### Directory

A new Durable Object class `Directory` (in `packages/server/src/DirectoryObject.ts`, since `Directory.ts` would clash with `directory.ts` on a case-insensitive disk; binding `DIRECTORY`, one instance named `open`, a new migration tag). Its logic is pure (`packages/server/src/directory.ts`), with a thin object around it, like the room.

- **State:** listings by code, each with `updatedAt`, and quick-match holds `{ code, device, until }`. They're saved in its SQLite storage.
- **`put(code, listing | null, seated)`:** add, replace or remove a listing. `seated` is the device IDs seated in the room, sent beside the listing (never in it: listings are public). Holds on that room for those devices are dropped, since the listing already counts their seats.
- **`list()`:** listings updated in the last 30 minutes, most recently updated first, at most 50. Listings older than 30 minutes are deleted.
- **`quick(device, mode)`:** finds a room for quick match.
  1. It considers only quick listings in that mode, updated in the last 30 minutes, with a free seat after subtracting live holds held by other devices.
  2. Lobbies come first, those with the most humans first, then games with a computer seat.
  3. It holds a seat for the device for 10 s and returns the code.
  4. With no room, it returns `null`, and the Worker creates a quick room and puts its listing in at once. The creator is already seated there.

### Endpoints

- `GET /api/open` and `POST /api/quick` are lookups, limited to 120 a minute per IP (`LOOKUP_LIMIT`); over it they reply `429 too_fast`.
- `GET /api/open` → `{ rooms: Listing[] }`.
- `POST /api/quick` with `{ device, name, mode }` → `{ code }`.
  - When a new room is needed, it uses the same per-IP `CREATE_LIMIT` as Create, and replies `429 too_fast` when over.
  - `400` for a bad body, and `503 busy` if no free code is found.
- `POST /api/rooms` takes `open: boolean` (default false).
- `PROTOCOL_VERSION` goes up by one, since `RoomView` and `settings` change.

`RoomView` gains `open`, `startIn` and `rematchIn` (as milliseconds left, like `deadlineIn`), so devices that connect later can show the countdowns. The rematch countdown also travels on the `clock` message (`rematchIn`), since a `room` message would reset the board mid-animation. `{ t: 'settings' }` carries a required `open: boolean`.

## Screens

**Home leads with online.** Local games stay: they work offline, suit one phone passed round, and the game screen already serves both. Home becomes:
- **Quick match** (primary, the big button)
- **Find a game**
- **Play with friends**: the existing create or join choice (**Create a room**, **Join with a code**); the old **Play online** button and its choice step go
- Under a small "On this device" heading: **Continue** (when there's a saved game) and **New game**

Any online button asks for the nickname first when there isn't one saved (the existing name step), then carries on to where it was going. A room link works as now.

**Quick match:**
- A mode picker (Classic / Ghana kicks, described like the other pickers) and **Go**. The last pick is saved per device (`ludo-unlimited:quick-mode`).
- While the request runs: "Finding a game…" and **Cancel**. Then it goes straight into the room.
- If the room has no seat for them when they connect (a lost race), it runs quick match once more. A second miss, a rate limit or a network error shows the message with **Try again**.

**Quick room lobby:**
- The seats filling, with no settings rows and no Start.
- "Starting in 14 s, computers fill empty seats".
- Share link stays, so friends can join too.

**Find a game:**
- One row per listing. Each row shows:
  - the mode: Classic, Ghana kicks or Custom
  - "Quick" or "Kofi's room"
  - "Waiting · 2 of 4" in the lobby, or "Playing · Blue free" (one or more colours)
  - the timer
- Tapping a row opens `/r/CODE` as any room link does. A quick room seats you, in its lobby or on a computer seat in its game. A hosted lobby lets you pick, and a hosted game puts you in as a watcher with the existing **Play as …** buttons.
- It refreshes every 5 s while on screen, when the tab becomes visible again, and with a **Refresh** button.
- Empty: "No open games right now" and **Quick match**.
- Error: "Couldn't load games" and **Try again**.

**Create a room:** a new row **Who can join: Friends with the code / Anyone**, defaulting to Friends. The host's lobby shows the same row. Open rooms show an "Open" tag next to the code.

**In a quick room's game:** no pause controls and no host notice. Results show "Next game in 12 s" and **Leave**, with no Rematch.

## Refinements made while planning

1. **Quick rooms seat everyone who connects:** in the lobby on the first free seat, and in a game by taking the first computer seat still playing. So a quick room opened from Find a game seats you too, rather than leaving you watching.
2. **Nobody here when the wait ends:** the countdown is cleared, and the next person seated starts a fresh 20 s.
3. **The rematch countdown** travels on the `clock` message (`rematchIn`), since a `room` message would reset the board mid-animation. `RoomView` carries `startIn` and `rematchIn` too, for devices that connect later.
4. **Refresh:** Find a game has a **Refresh** button instead of pull-down.
5. **`settings`** carries a required `open: boolean`.
6. **Leaving a quick lobby:** a player who disconnects in a quick room's lobby gives up their seat at once, so it's free for the next arrival.
7. **Finished players:** a finished player's seat is never released to others.

## Error handling

- **Directory down:** the list and quick match show **Try again**. Private rooms, codes and links still work: rooms never wait on the directory.
- **Stale listings:** opening a room that's gone shows "No room with that code". A full one shows the watcher view. The next refresh drops it.
- **Race for the last seat:** the 10 s hold covers quick match. Joining from the list goes through the room's normal rules, and the loser watches.
- **Abuse:** room creation shares one per-IP limit, and lookups (`/api/open`, `/api/quick`) another, 120 a minute. `/api/open` is read-only and capped at 50 rows. Names are cleaned as now.
- **Unexpected errors** in the directory are caught and logged with `console.error`. The endpoint replies `503`, and nothing changes.

## Testing

- **Room reducer** (`room.test.ts`, fixed clock and dice):
  - Quick rooms: auto-seating, refused host and seat messages, the start when full, the 20 s start with computers, waiting when nobody is connected at `startAt`, and the 15 s auto-rematch.
  - The hosted `open` toggle at creation and in the lobby.
  - The 120 s seat release and getting the seat back, in open rooms only.
  - `listing` after each change: added, updated, removed, and not repeated when unchanged.
- **Directory** (`directory.test.ts`, pure):
  - Put, replace and remove.
  - Dropping listings after 30 min.
  - The 50 cap and ordering.
  - Quick match order (fuller lobbies, then computer seats), holds, hold expiry, and the mode filter excluding custom and hosted rooms.
- **Workers pool:** quick match creates a room, and a second quick match in the same mode lands in it. `GET /api/open` shows it.
- **App:**
  - The list rows, empty and error states.
  - The mode picker remembering its pick.
  - Quick match retrying once.
  - The quick lobby countdown and the results countdown.
  - The Who can join row.
  - Home: the new order, the name step before any online button when no name is saved, and Continue only with a saved game.
- **Browser** (Playwright): two contexts quick match the same mode and land in the same room, and the game starts. A third context finds it in Find a game, opens it and is seated on a computer's seat.
- Existing tests still pass.
