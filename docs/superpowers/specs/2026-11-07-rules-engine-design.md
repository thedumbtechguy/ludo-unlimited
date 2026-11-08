# Ludo Unlimited — Rules Engine Design

**Date:** 2026-11-07
**Scope:** The rules engine only. Board UI, online multiplayer, and accounts/lobby get their own specs later.

## Goal

A Ludo game whose standout feature is Ghanaian house rules (Back Kick, Line Kick, Home Kick, Labourer), each one a toggle. The rules engine is a pure TypeScript package shared by the client and the server:

- **Server:** rolls the die, accepts a move only if it appears in `legalMoves`, and keeps the event log.
- **Client:** shows legal moves and results immediately, using the same code.

Guiding principles:
- **A kick means landing on a piece.** What sets this game apart is *where* you can land: counts can run **backwards** as well as forwards, and they can go **into the middle lanes**, which most games treat as safe. Line Kick (the side kick) is the one special case.
- **Kicks are shortcuts.** A piece's route is decided only by where it physically is, never by how far it has travelled. A backward count runs the route in reverse.

## Rules

### Base game

- 2–4 players, each with 4 pieces. One die.
- A 6 brings a piece from base onto the player's start square.
- **Roll your sixes first** (always on, except in `endsTurn` mode):
  - A player keeps rolling while they roll 6s, and stops at the first non-6. Three or more 6s carry no penalty.
  - **A 6 earns another roll only if it can be played.** A 6 with no legal move on the board as it stands is lost, the rolling stops, and any 6s rolled before it are played as usual.
  - The rolls are then played **in the order rolled**, one move per roll.
  - **Combining for a kick:** the current roll plus the next queued roll(s), in order, can be added together into ONE move. Rolls combine for any forward move; for a back, line or home kick they combine only when the move actually kicks. A pending 6 can also enter a piece from base and carry on forward from the start square with the next roll(s) as one move, under the same rule. Example: rolled 6 then 4 → one forward move of 10, or, with an opponent 10 behind, one Back Kick of 10 uses both rolls. Blocks on the path still stop it. A single-roll move with the same result is preferred. A Labourer owner never combines.
  - **Stopping early:** after rolling a 6, the player may choose to stop rolling and play the rolls they have. The turn then ends when those rolls are used, with no further rolling.
  - When a roll's turn comes and it has no legal move, it's skipped and play moves to the next roll.
  - When all the rolls are used, play passes to the next player.
  - If the player finishes while rolls remain, the remaining rolls are dropped.
- **In `endsTurn` mode, one roll at a time:** roll, move, and a playable 6 then rolls again. Three 6s in a row carry no penalty.
- Getting a piece home gives no bonus roll.
- **After a kick** is a game setting, `afterKick`:
  - `endsTurn`: any kick ends the turn, even on a 6. Kicks other than a Front Kick are optional, so a player can skip one to keep their extra roll.
  - `normal` (**the default**): a kick changes nothing, so a 6 still rolls again. For example, you roll a 6 to bring a piece out, kick someone sitting on your start square, and roll again.
  - `bonusRoll`: a kick always earns another roll. This only applies when the kicker is the player whose turn it is, not a Labourer owner playing someone else's roll.
- Reaching home needs an exact roll.
- There are no safe squares. That includes start squares and, when Home Kick is on, home lanes.
- **Blocks:** two pieces of the same colour on one square form a block.
  - No opponent piece can pass a block in either direction, by any kind of move.
  - No opponent piece can land on a block.
  - A block can't be kicked.
- **Must move:** if any legal move exists, the player has to make one. If none exists, the roll is wasted.
- **End condition** is a game setting:
  - `firstWins`: the first player to get all 4 pieces home wins, and the game ends.
  - `playForPlaces`: finished players are skipped, and play continues until one player is left.

### Front Kick (always on, not a toggle)

When a forward move lands exactly on a lone opponent, that opponent goes back to base. Making the move means the kick happens; there's no option to spare them. The player is still free to choose a different move that doesn't kick.

### Back Kick (toggle)

- A piece on the main track can move **backwards** by the roll, but only if it lands exactly on a lone opponent. That opponent is kicked.
- Moving backwards just to reposition isn't allowed.
- A backwards move can go past the player's own start square.
- A piece that has just entered the board can Back Kick straight away.
- **Wicked move:** a piece in its own home lane can count backwards out of it (R4 → R3 → R2 → R1 → lane entry → back along the track), to land on and kick a piece by Back Kick, or to set up a Line Kick.
  - **Wicked isn't its own kick kind**: it's on top of the kick that happened (a Back Kick plus Wicked, or a Line Kick plus Wicked).
  - **The price is a full lap.** The piece was nearly home and chose to go around again. After a wicked kick it must go all the way around the board before it may enter its home lane: at its lane entry it carries straight on along the track instead of turning in. The lap is done once it passes (or lands on) its own start square, and from then on it turns into its lane as normal.
  - A piece doing its lap that gets kicked back to base loses the lap requirement: it starts fresh.
  - Effects: the kick's own effect and callout play first, then "Wicked!" on top.
- A piece in an *opponent's* lane can't move backwards (deeper into that lane).
- Optional.

### Line Kick (toggle)

- Each arm of the board has two outer track columns with a middle column between them.
  - In rows 1–5 of an arm, the middle squares are that arm's home lane squares 1–5.
  - In row 0, the outer tip, the middle square is a track square (the arm's lane entry). **Row 0 Line Kicks too**, across that tip square, and any piece standing on the tip blocks it.
- The Line Kick is checked after an enter, forward or backward move whose landing square is empty or holds the mover's own piece. If that square is in rows 0–5 and a lone opponent sits on the matching square across the arm, the mover may Line Kick.
- The lane square between the two must be empty.
- On a Line Kick, **the mover jumps across onto the opponent's square and stays there.** The opponent goes to base.
- It works across any colour's lane, including the mover's own. Across your own lane, it can be a huge shortcut.
- It also works after a backwards move, as long as that move's landing square is empty or the mover's own. This needs **both** Back Kick and Line Kick on. A backwards move whose only purpose is to set up a Line Kick is allowed.
- Whoever lands is the one who can kick. If an opponent lands across from you, they can kick you.
- Optional. A block can't be Line Kicked.

### Home Kick (toggle)

- An opponent's piece inside their own home lane can be kicked.
- If a count, forward or backward, reaches an opponent's lane entry and then continues into their lane to land exactly on a lone opponent, the mover may turn into that lane and kick them. This includes a piece that starts its move on the lane entry.
- Counting backwards into a lane needs **both** Home Kick and Back Kick on.
- A piece already in an opponent's lane can't turn back into it during the same move.
- The kicking piece stays on that lane square. While it's there, the lane's owner can kick it.
- To leave, the piece moves **back out toward the main track** and then carries on along its own route. It can kick a lone opponent it lands on exactly on the way out.
- Optional.

### Labourer (toggle)

- **Trigger:** a kick leaves the victim with no pieces in play. Pieces in base or already home don't count as in play. The victim becomes the kicker's Labourer.
- **While it lasts:**
  - The victim keeps rolling on their turn.
  - Any roll under 6 is played by the owner, who has to use it if they have a legal move. Otherwise the roll is wasted.
  - After that, play passes to the next player after the victim.
- **End:** the victim rolls a 6. The Labourer ends immediately, the victim plays that 6 themselves, and they roll again as usual.
- A victim has at most one owner at a time.
- An owner can hold several Labourers, and can be someone else's Labourer at the same time.
- When an owner finishes the game, their Labourers are released.

## Architecture

### Board model

- The board uses the standard 15×15 cross, with 52 shared track squares numbered **once for everyone**, not per player.
- Each colour has a start index (`color × 13`), a lane-entry track square (the row-0 tip of its own arm), and a 5-square home lane leading to home.

```ts
type Position =
  | { kind: 'base' }
  | { kind: 'track'; index: number }                // 0–51, shared
  | { kind: 'lane'; owner: Color; index: number }   // 1–5; owner may differ from the piece's colour
  | { kind: 'home' }
```

**Route.** A piece's route depends only on its position, with no lap counting:
- On the track, moving forward, a piece turns into its own lane when it passes its own lane entry.
- In its own lane, it moves toward home, with an exact roll needed for home.
- In an opponent's lane, a forward move heads back toward the tip, then carries on along the track.

**Lane entry.** A piece standing on its own lane entry turns into its lane on its next forward move. This holds even if the piece got there by a Back Kick or Line Kick.

**`path(piece, steps, direction)`** returns the squares passed through and the destination, or `null` if the move is illegal. A move is illegal if an opponent block is on the path or at the destination, or if the roll overshoots home.

**`lineAcross` table**, built once: `trackIndex → { across: trackIndex, between: Position }`. It covers rows 0–5 of every arm (row 0 across the tip square), which is 48 entries.

### Game state

```ts
type Settings = {
  players: 2 | 3 | 4
  rules: { backKick: boolean; lineKick: boolean; homeKick: boolean; labourer: boolean }
  endCondition: 'firstWins' | 'playForPlaces'
  afterKick: 'endsTurn' | 'normal' | 'bonusRoll'
}

type GameState = {
  settings: Settings                        // fixed for the whole game
  players: { color: Color; pieces: Position[]; finishedPlace?: number }[]
  turn: Color                               // who rolls next
  pendingRoll?: number                     // the roll being played now
  queuedRolls: number[]                     // rolled this turn: while rolling, every roll so far; while playing, the rolls after pendingRoll
  labourers: Partial<Record<Color, Color>>  // victim → owner
  log: Event[]                              // every roll and move; source of truth
  status: 'playing' | 'finished'
}
```

The state is plain JSON, so it can be sent over WebSockets and stored in Durable Object storage. Replaying `log` must always rebuild the same state.

### API

```ts
roll(state, value): GameState              // the server supplies the value
legalMoves(state): Move[]
applyMove(state, move): GameState          // throws if the move isn't in legalMoves
pass(state): GameState                     // the server uses this on a turn timeout
```

### Moves

```ts
type Move =
  | { kind: 'enter';    piece: PieceId; to: Position; kick?: PieceId }
  | { kind: 'forward';  piece: PieceId; to: Position; kick?: PieceId }
  | { kind: 'back';     piece: PieceId; to: Position; kick: PieceId }
  | { kind: 'line';     piece: PieceId; via: Position; to: Position; kick: PieceId }
  | { kind: 'homeKick'; piece: PieceId; to: Position; kick: PieceId }
```

- **Whose pieces:** normally the current player's. If the current player is a Labourer victim and rolled under 6, the owner's.
- `enter`: a roll of 6 and a piece in base. The start square isn't an opponent block. A lone opponent on the start square is kicked.
- `forward`: a legal path. Landing on a lone opponent kicks them. Landing on your own piece forms a block.
- `back`: Back Kick is on, the piece is on the track or in its own lane, it lands exactly on a lone opponent, and the path is legal.
- `line`: Line Kick is on. The `via` square comes from a legal forward or backward move and is empty or holds the mover's own piece. A `lineAcross` entry exists for `via`, the `between` square is empty, and a lone opponent is on `across`.
- `homeKick`: Home Kick is on, and counting forward (or backward, with Back Kick also on) through an opponent's lane entry lands exactly on a lone opponent in their lane.
- **Duplicates are merged:** moves with the same piece, destination and result collapse into one.

### Turn flow

1. **Rolling.** The server rolls, and the roll joins `queuedRolls`.
   - If the roller is a Labourer victim and rolled a 6, the Labourer ends. They keep rolling for themselves.
   - A 6 (outside `endsTurn` mode) means roll again.
   - A non-6 starts the playing phase.
2. **Playing.** The first queued roll becomes `pendingRoll`. If it has no legal move, it's skipped and the next one is taken.
3. `legalMoves` runs for `pendingRoll`, and the player picks one.
4. The move is applied, and kicked pieces go to base.
5. If Labourer is on and the kick left the victim with no pieces in play, a new Labourer is created.
6. If all 4 of the mover's pieces are home, they get the next place, and the end condition is checked.
7. Next:
   - Any queued rolls left: the next one becomes `pendingRoll`, as in step 2.
   - Queue empty, and a move this turn kicked with `afterKick` `bonusRoll` by the turn player: that player starts a new rolling phase.
   - Queue empty otherwise: play passes to the next unfinished player.
   - **`endsTurn` mode** (one roll at a time): a kick passes play on. Otherwise a playable 6 rolls again; a 6 that couldn't be played, and any other roll, passes play on.

## Testing (Vitest)

- **Scenario tests**, one file per rule: `frontKick`, `backKick`, `lineKick`, `homeKick`, `labourer`, `blocks`, `finishing`. A `place({ red: [...], yellow: [...] })` helper sets up the board. Each rule decision in this spec gets at least one test, including:
  - a Line Kick on row 0 across the tip, blocked by a piece on the tip
  - a piece in the lane blocks a Line Kick
  - Back Kick into a Line Kick
  - a Line Kick across your own lane as a shortcut
  - a Back Kick past your start onto your lane entry, then entering the lane
  - Home Kick, and exiting back out of the lane
  - Labourer ending on a 6
  - an owner being Labourered while still owning someone
- **Rule-combination tests:** the scenarios run with the relevant toggles on and off.
- **Invariant tests on random games:** thousands of seeded games with random rulesets. After every move, each player has 4 pieces, no block has been passed or kicked, and every game ends.
- **Geometry tests:** `lineAcross` has exactly 48 entries, and coordinates are checked against the board drawing.
- **Replay test:** replaying `log` rebuilds the same state.

## Out of scope (separate specs)

- Game modes: named presets of `Settings`, such as a Ghana Classic mode with every kick on. These can be added on top of the engine without changing it.

- Board UI and animation: React with an SVG board, as a PWA, wrapped with Capacitor for the app stores.
- Online multiplayer: one Cloudflare Durable Object per game room, WebSockets, server-side dice, turn timers, reconnects, bots.
- Accounts, lobby and game history.

## References

- Lelu Ludo engine (Swift), used as a geometry reference: https://github.com/richardforjoejnr/oware/tree/main/packages/LudoEngine
- ghanaludo.com, a competitor with rule toggles.
