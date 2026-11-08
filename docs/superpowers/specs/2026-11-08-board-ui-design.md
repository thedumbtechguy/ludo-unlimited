# Ludo Unlimited — Board UI, Bot and Effects Design

**Date:** 2026-11-08
**Depends on:** `packages/engine` (rules engine, see `2026-11-07-rules-engine-design.md`)
**Delivery:** two rounds.
- **Round 1:** a playable game with computer opponents.
- **Round 2:** effects. Each round gets its own implementation plan.

## Goal

Make Ludo Unlimited playable on one device: 2–4 seats, each Human or Computer, in either game mode, on phones, tablets and desktops. Round 2 adds the "explosive" effects that make big moments, such as kicks, 6 streaks and the wicked move, feel great.

## Scope

**In:**
- Pass and play.
- A sensible computer opponent.
- Setup with modes and rule toggles.
- Saving and resuming a game.
- An installable PWA.
- Round 2: effects, sound effects and background music.

**Out (later specs):**
- Online multiplayer: Cloudflare Durable Objects with dice rolled on the server.
- Accounts.
- Capacitor app-store builds.
- More bot difficulty levels.
- Alternative themes, such as a kente theme.

## Architecture

- **`packages/web`:**
  - Vite, React 18 and TypeScript, depending on `@ludo/engine` through the npm workspace.
  - Built as a PWA with `vite-plugin-pwa`: a web manifest and offline caching.
- **The bot lives in the engine** (`packages/engine/src/bot.ts`), so the server can reuse it later.
- **Effect events live in the engine** (`packages/engine/src/effects.ts`, round 2), so every player's screen will derive the same effects when the game goes online.
- **Dice:** rolled on the device with `crypto.getRandomValues`, behind a `Dice` interface (`() => 1..6`). Tests inject fixed dice. Online play will replace this with server rolls.
- **Game state:** one `useGame` hook holds the engine `GameState` and exposes `roll()`, `select(piece)`, `play(move)` and `newGame(settings, seats)`. It calls the engine's `roll` and `applyMove` and never changes the state in place.
- **Saving:**
  - After every event, `{ settings, seats, log }` is written to `localStorage`.
  - On Continue, the state is rebuilt with `replay(settings, log)`.
  - Reads and writes are wrapped in try/catch, so the game still works with no storage.

## Screens

1. **Home:** New game, plus Continue when a saved game exists.
2. **Setup:**
   - Mode: Classic or Ghana.
   - An expandable section with each rule toggle (Back, Line, Home Kick, Labourer) and the after-kick setting (normal, ends turn, bonus roll).
   - 2–4 seats. Seat colours follow the engine's seat order. Each seat is Human or Computer.
   - End condition: first wins, or play for places.
3. **Game:**
   - The board.
   - A large dice button.
   - A turn banner in the current player's colour, showing who is moving when a Labourer owner plays someone else's roll.
   - A Labourer badge on each victim's yard.
   - A short message after a kick, e.g. "Red Line Kicked Yellow!"
4. **Results:** the placings, with Play again (same settings) and Home.

## Board (Look B: clean and modern)

- **SVG** with `viewBox="0 0 600 600"` (40 px per square), scaled to fit its container.
- **Colours:**
  - red `#e5484d`, green `#30a46c`, yellow `#f5b301`, blue `#3e63dd`
  - board `#cbd5e1`; track tiles `#ffffff` with a 2 px `#cbd5e1` border and 8 px radius
  - lanes and start squares are filled with their owner's colour
  - yards are rounded 24 px squares holding a white 160 px panel with the base pieces
  - the centre is a 4-colour pinwheel
- **Pieces:** a 30 px circle with a 4 px white rim and the shadow `0 4px 10px rgba(15,23,42,.35)`. Pieces stacked on one square are drawn slightly apart, with a count badge.
- **Geometry** comes from the engine's exports (`TRACK`, `laneCell`, the yard layout), so the board can never disagree with the rules.
- **Fonts:** Space Grotesk for headings, Inter for body text.
- **Layout:**
  - Portrait (phone): the board fills the width with a 16 px gutter, and the controls sit below it.
  - Landscape and desktop: the board is on the left (up to the viewport height) and the side panel on the right.
  - There's never a horizontal scroll.

## Interaction

1. Tap the dice to roll. It's disabled while a move is pending, and during computer turns.
2. Pieces with at least one legal move pulse.
3. **Tap a piece:**
   - If it has exactly one legal move, the move plays immediately.
   - Otherwise a marker appears on each target square: blue for a plain move, red for a kick. Tapping a marker plays that move, and tapping elsewhere deselects the piece.
   - A Line Kick's marker sits on the opponent's square, which is the final destination.
4. **Animation:**
   - Pieces slide square by square along the route. The path is computed with the engine's path functions, which get exported for this.
   - A Line Kick moves to `via`, then hops across.
   - A kicked piece travels back to its yard.
   - Move animation takes about 120 ms per square.
5. **Computer seats:**
   - They roll and move automatically.
   - There's a 600 ms pause before rolling and 400 ms before moving, so humans can follow.
   - Moves are chosen with `chooseMove`.
6. **Wasted rolls:** a roll with no legal move shows the dice result and a short "No moves" notice, then play passes on.
7. **Accessibility:**
   - The dice and the piece targets are real `<button>`s with `aria-label`s, e.g. "Red piece 2, on track square 14".
   - Targets are at least 44 px when touched (an invisible hit area round each square).
   - Keyboard: Tab moves through movable pieces, then targets.

## Bot (engine)

```ts
chooseMove(state: GameState, random: () => number): Move | undefined
```

- `undefined` when there's no legal move.
- **Priority:**
  1. a move to home
  2. a kick (any kind)
  3. entering a piece
  4. the move that advances furthest along the mover's route
- Within a priority, ties are broken with `random`.
- **"Advances furthest"** uses a progress measure: steps from the mover's start to the destination along its route, with home lane squares counting as 51–55 and home as 56. It's measured from the start square, so a shortcut from a kick counts as real progress.
- **Tests:**
  - It only ever returns a legal move.
  - It follows each priority.
  - Fixed-seed bot-vs-bot games always finish, under random rulesets.

## Round 2: Effects

### Engine: effect events

```ts
describeMove(before: GameState, move: Move, after: GameState): GameEffect[]
describeRoll(before: GameState, after: GameState): GameEffect[]

type GameEffect =
  // via: a line kick's crossing square; from: the square a back kick stepped off
  | { type: 'kick'; kind: 'front' | 'back' | 'line' | 'home'; at: Position; kicker: PieceId; victim: PieceId; via?: Position; from?: Position }
  | { type: 'wicked'; piece: PieceId; at: Position }         // straight after the kick, when it was the wicked move
  | { type: 'sixStreak'; color: Color; count: number }        // the turn player's run of consecutive 6s
  | { type: 'streakEnded'; color: Color; count: number }
  | { type: 'labourerStart'; victim: Color; owner: Color }
  | { type: 'labourerFreed'; victim: Color }
  | { type: 'blockFormed'; color: Color; at: Position }
  | { type: 'pieceHome'; piece: PieceId }
  | { type: 'playerFinished'; color: Color; place: number }
  | { type: 'gameOver' }
```

- **Kick kinds:** a `forward`/`enter` kick is `front`. The `back`, `line` and `homeKick` move kinds map to `back`, `line` and `home`.
- **Wicked is not a kind of kick.** It's a separate effect that follows the kick's own effect (`isWicked` in the engine). It happens when a kick lands a piece that was on its way home in a spot that means going round the board again:
  - The piece was on its home stretch, at least 44 squares into its lap. For a line kick, the square it crossed from counts too.
  - It ends up more than half a lap (26 squares) further back.
  - Examples: a back kick counted out of the player's own home lane, past the entrance and onto the main route; or a line kick from row 8 that lands on row 6.
  - A back kick that stays on the way home (down row 8) is an ordinary back kick.
- **Six streak:** count the turn player's consecutive 6 rolls in the log since their turn began.
- These are pure functions, tested like the rest of the engine.

### UI: effects layer

| Moment | Effect |
|---|---|
| 6 streak | 1: the dice flashes. 2: embers drift off the dice. 3+: the dice is wrapped in flames whose size grows with each extra six. 4+: an "ON FIRE" banner and flames along the board's edge. The streak ending dies the fire down. |
| Any kick | An impact flash and a ~200 ms screen shake of up to 6 px. Sparks burst in the kicker's colour, and the kicked piece arcs back to its yard with a trail. |
| Back Kick | A "BACK KICK!" stamp. |
| Line Kick | A lightning zap across the lane. |
| Home Kick | A shockwave ripples down the lane. |
| Wicked | After the kick's own effect: dark smoke and a "WICKED!" stamp, the most dramatic effect. |
| Labourer | Chains slam over the victim's yard. When the victim is freed, the chains shatter. |
| Block formed | A shield shimmer. |
| Piece home | A sparkle fountain from the centre. |
| Win | Fireworks and confetti. |

- **Tech:**
  - The browser's Web Animations API (`element.animate`) for the text stamps, screen shake and arcs, with no animation library.
  - One full-screen `<canvas>` particle system (written in-house, `requestAnimationFrame`) for fire, sparks, smoke and confetti.
  - The particle cap is about 400, and the system pauses when the tab is hidden.
- **Settings:**
  - Effects Full or Reduced, defaulting to Reduced when `prefers-reduced-motion` is set. Reduced means no shake, a tenth of the particles, and stamps that fade rather than slam.
  - The setting is saved in `localStorage`.
- **Sound hook:** a `playSound(effect)` function, called for each effect (see "Sound and music" below).

### Sound and music

**Sound effects**
- **Source:** recorded CC0 samples (e.g. Kenney packs), bundled with the app so they work offline. No synthesised beeps.
- **What plays:**
  - rolling: a dice rattle, then a landing clack timed to the 3D spin
  - moving: a soft tick per square and a click on landing
  - entering: a pop
  - kicks: an impact, with a zap for line kicks, a thud for home kicks and a low hit for wicked; the kicked piece whooshes back to its yard
  - 6-streak: a crackle that builds with the fire, and a whoosh on "On fire"
  - Labourer: chains clank on, then shatter when freed
  - a chime when a piece gets home, and a short fanfare on the win
  - a light tap on buttons
- **Volume:** balanced for long games. Dice and kicks are the loudest; steps are quiet.
- **Setting:** "Sound: On/Off" in the in-game menu, stored per device (`ludo-unlimited:sound`), on by default.

**Music**
- **What:** a calm, chill game loop. A free CC0 or properly licensed loop for now; it can be replaced later by swapping the file.
- **Default:** on, at low volume (about 25%).
- **Ducking:** it dips under big moments (kicks, "On fire", the win) and comes back up after.
- **When:** it pauses when the tab or app is hidden, and resumes after.
- **Loading:** it loads only once a game starts, never on the first page load. Keep it to one compressed loop of about 1–2 MB, cached after the first load.
- **Setting:** "Music: On/Off" in the in-game menu, separate from Sound, stored per device (`ludo-unlimited:music`).

**Both**
- **Starting audio:** phones only allow audio after a user gesture, so the audio context starts on the first tap. There's no "enable sound" screen.
- **Effects setting:** Reduced effects doesn't mute anything; sound and music have their own switches.

## Testing

- **Engine:**
  - Bot unit tests and bot-vs-bot games.
  - `describeMove`/`describeRoll` tests for each effect type (round 2).
- **Web, using Vitest and Testing Library:**
  - The setup screen builds the right settings.
  - With fixed dice: roll → the pulsing pieces are exactly the movable ones → tapping a piece with several moves shows its targets → tapping a target applies that move.
  - A single-move piece plays immediately.
  - Computer seats play by themselves.
  - Saving and resuming round-trips.
- **Browser test (Playwright):**
  - A 4-computer game with fixed dice and animations sped up plays through to the Results screen.
  - It runs at phone and desktop viewport sizes.
