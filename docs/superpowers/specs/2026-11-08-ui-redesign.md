# Ludo Unlimited — UI Redesign

**Date:** 2026-11-08
**Replaces:** the screen styling in `2026-11-08-board-ui-design.md`. The board drawing, interactions, dice and game logic stay as they are.
**Approved mockups:** https://claude.ai/artifact/EZk99nyc2fuyny9hUiPpia (the "Game screen redesign" row).

## Goal

Everything around the board should look like it belongs to this game, not to a template. The board is the interface: players live on their yards, and the controls sit directly on the table.

## Rules for every screen

- **No cards.** No boxed containers, offset or "3D" shadows, tilted labels, pills holding sentences, gradients or glows. Group things by spacing and thin dividers.
- **Colour:**

  | Token | Value | Use |
  |---|---|---|
  | `--table` | `#1F5B57` | the background of every screen |
  | `--text` | `#F3E9D2` | main text on the table |
  | `--muted` | `#A9CBC5` | section headings, secondary values |
  | `--line` | `rgba(243,233,210,.16)` | row dividers |
  | player colours | red `#e5484d`, green `#30a46c`, yellow `#f5b301`, blue `#3e63dd` | the board, and the main button |

  The main button is painted in the **current player's colour**, with white text, or `#3d2a00` on yellow. There's no other accent colour.
- **Type:** Inter only. Use weight for hierarchy: 900 for titles, 800 for names and buttons, 600–700 for body. Sentence case everywhere, with no all-caps labels.
- **Buttons:** flat, 12px corner radius, at least 52px tall for main actions and at least 44px for any tap target. Secondary buttons have a transparent fill and a 2px `--text` border at 55% opacity.
- **Motion:** only for the dice spin, piece movement and kick callouts. `prefers-reduced-motion` turns the decorative motion off.

## Board orientation

- The board is drawn turned so that the **first human seat's yard is bottom-left**. With no human seat, red goes bottom-left.
- It's turned once when the game starts and stays put. In pass-and-play it doesn't turn between players.
- Implementation: the board's SVG and the overlay buttons share one transform. Text on the board (yard labels, piece numbers, the "6+4" labels) is turned back so it reads upright.

## Yards as player panels

Each yard shows:
- **Top edge:** the player's name ("You" for the first human, "Computer", or "Player 2/3/4" for further humans) on the left, and "N home" on the right. Text is white, or `#3d2a00` on yellow.
- **Whose turn:** the active player's yard gets a white 5px inner outline and, on its top edge, a white tag reading "Your turn" (first human) or "Green's turn" (anyone else) in place of "N home".
- **Labourer:** on the victim's yard, a chain icon and "Labourer to Green" along the bottom edge.
- **Finished:** a finished player's yard shows "1st", "2nd" and so on in place of "N home".

## Game screen

**Phone (portrait):**
```
 Ludo Unlimited                    [≡]   ← title, menu button
┌───────────────────────────────────┐
│               board               │  ← full width
└───────────────────────────────────┘

 [3D dice]   6  4                       ← roll tray: the current roll outlined in the player's colour
             Tap a numbered square, or a piece      (moving)
             [ Roll again ]  [ Stop ]               (rolled a 6)
```
- The dice keeps its current 3D look and spin. Tapping the dice still rolls.
- "Roll again" does the same thing as tapping the dice; it's there to pair with Stop.
- The controls area has a fixed height, so nothing jumps.

**Desktop and landscape tablet:**
- The board is centred at up to `100vh - 96px`.
- The controls column sits to its right: the dice, then the tray, then the hint or buttons.
- The title and the rules name ("Ghana rules", "Classic rules" or "Custom rules") go on the top bar.

**Kick callouts:**
- Big text over the centre of the board in the kicker's colour, Inter 900, with a thick white outline (`-webkit-text-stroke` plus `paint-order: stroke fill`).
- The text is "Kick!", "Back kick!", "Line kick!", "Home kick!" or "Wicked!" (a back kick out of the player's own home lane).
- A smaller outlined line underneath, e.g. "Red sent Yellow back to base".
- It fades in and out over about 1.4s and isn't clickable. Round 2 effects will build on it.

**Menu (`≡`):** a sheet from the bottom with "Quit to home" and "Restart game".

## Setup screen ("New game")

Rows on the table, each at least 52px tall, separated by `--line`:
- **Back button** and the "New game" title.
- **Players section:**
  - A "Players" row: 2, 3 or 4, opening a picker.
  - One row per seated colour (seat order follows the engine's `SEATS`): a colour dot, the colour name, and a button that switches between You/Player and Computer. The first human seat reads "You".
- **Rules section:**
  - "Ghana rules": a switch. On is Ghana mode, off is Classic. The row shows "All kicks, Labourer" when on, "Plain Ludo" when off, and "Custom" when individual rules have been changed.
  - "After a kick": opens a picker (Carry on / Turn ends / Bonus roll).
  - "Game ends": opens a picker (When one player wins / When places are set).
  - "Choose rules one by one": opens a sheet with a switch for each of Back Kick, Line Kick, Home Kick and Labourer.
- **Start game:** a full-width main button at the bottom, in red (the first seat's colour).

**Pickers and sheets** slide up from the bottom over a dimmed table. Options are rows with a checkmark on the current one. Tapping an option closes the picker.

## Home screen

- "Ludo Unlimited" as a large title at the top.
- One line of plain description: "Ludo with Ghanaian kicks."
- Buttons: New game (main), and Continue (secondary, only when a saved game exists).
- No illustration other than the board itself, shown under the buttons, small and static, in its starting position.

## Results screen

- "Game over" title.
- One row per player, in place order: colour dot, name, place.
- Buttons: Play again (main) and Home (secondary).

## Keep working as before

- Every interaction from Round 1 and later: numbered pieces and destinations, the shared-square chooser, Stop rolling, the roll tray, auto-play of a single move, saving and Continue, computer seats.
- Accessibility: real buttons, aria-labels, keyboard focus, 44px tap targets.
- The panel doesn't jump: fixed heights where content changes.

## Testing

- Update the existing component and App tests to the new structure. Keep every behaviour test.
- New tests:
  - board orientation: the first human seat's yard is drawn bottom-left
  - yard labels: names, home counts, the turn tag, the Labourer line
  - setup rows: the switch, pickers and per-rule sheet produce the right `Settings`
  - kick callout text for each kick kind
- Browser tests: the existing full-game and no-sideways-scroll tests, at phone and desktop sizes.
- Screenshots of every screen at phone (390×844) and desktop (1280×800), compared against the mockups before calling it done.
