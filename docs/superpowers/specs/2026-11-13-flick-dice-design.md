# Ludo Unlimited — Flick Dice Design

**Date:** 2026-11-13
**Depends on:** the rules engine, board UI and online rooms (steps 1 and 2).
**Prototype:** the "Skill Dice Options" page (card 3, Flick and tumble). Its sliders and simulations produced the numbers in [Tuning](#tuning).

## Goal

Rolling becomes a small act of skill. The player grabs the die and throws it across the board. It tumbles one face for every square it travels, so how hard they throw decides where it stops. A good thrower gets a 6 about twice as often as a normal die gives one, but never reliably. A careless one gets a normal die. It must be just as fair online, where nobody can make their phone report a better throw.

## Scope

**In:**
- A **Flick dice** setting, off by default, for local and hosted online games, in any mode.
- The throw as one pure function in the engine, used by the server, the app and the computer players.
- Throwing by dragging the die on the board, plus a **Throw for me** button.
- Everyone in a room watching the same throw.
- Computer players that throw with skill matching their level.

**Out:**
- Flick dice in quick match (quick rooms stay on random dice).
- Real 3D dice physics. The face order is a game rule, not how a cube really rolls.
- Throw sounds and haptics (a follow-up, once the feel is settled).
- Ratings, or tracking how good someone is at throwing.

## Decisions

| Question | Decision |
|---|---|
| Who decides the face online | The room server, always. The phone sends only the swipe. |
| Where the randomness comes from | A seed the server draws when it receives the swipe, so nobody can know it while throwing. |
| Do phones need identical physics | No. Phones replay the throw for the animation, but it always ends on the server's face. |
| What stops a scripted perfect swipe | The server adds a hand shake (3% speed, about 1° direction) to every swipe. Without it a perfect swipe gets a 6 70–90% of the time; with it, about 40%. |
| What stops gentle, easy-to-judge throws | A throw must tumble at least 10 times to count. Shorter throws are void, and the player throws again. |
| Endless void throws | The turn clock keeps running through them. After the third void in a turn, the server throws for the player. |
| Which face the die starts on | The face of the last roll in the game (1 at the start). It's shown before the throw, because judging from it is the skill. |
| The table | The board. One square is one tumble. |
| Where a throw starts | Anywhere in the thrower's own home base (6 × 6 squares). |
| Mode or setting | A setting (`dice`) next to `afterKick`, so it works with Classic, Ghana and custom rules. |
| Time running out | The computer throws for the player, as it already rolls for them. |

## The throw (engine)

A new `packages/engine/src/throw.ts`, exported from the package.

```ts
/** What the player did, in board squares and squares per second. */
export type Swipe = { x: number; y: number; vx: number; vy: number }

export type ThrowTuning = {
  minTumbles: number   // 10
  friction: number     // 0.05: deceleration varies by up to ±5%
  bounceLoss: number   // 0.20: each wall bounce keeps 80–100% of the speed
  shake: number        // 0.03: speed × (1 + noise(3%)), direction turned by noise(1.5%) radians
  decel: number        // squares/s², re-measured on the board (32 in the 16 × 9 prototype)
  maxSpeed: number     // squares/s, faster swipes are slowed to this (60 in the prototype)
}
export const THROW_TUNING: ThrowTuning

export type ThrowResult = {
  counts: boolean     // tumbles >= minTumbles
  face: number        // the face it stops on (meaningless when it doesn't count)
  tumbles: number
  bounces: number
  ms: number          // how long the animation takes
}

/** The face order as the die tumbles: 1 → 2 → 3 → 6 → 5 → 4 → 1. */
export const TUMBLE_ORDER = [1, 2, 3, 6, 5, 4]

export function throwDie(swipe: Swipe, seed: number, startFace: number, tuning?: ThrowTuning): ThrowResult
/** The die's position and face over time, for the animation. Same inputs, same path. */
export function throwPath(swipe: Swipe, seed: number, startFace: number, tuning?: ThrowTuning): Iterable<{ t: number; x: number; y: number; face: number }>
```

**How it runs** (as in the prototype):
1. A `mulberry32(seed)` stream (moved from `packages/web/src/dice.ts` into the engine) gives every random number below, in this order. The hand shake comes first, then the friction, then one number per bounce.
2. Hand shake. The speed is scaled by `1 + noise × shake` and the direction turned by `noise × shake / 2` radians, then capped at `maxSpeed`.
3. Fixed steps of 1/120 s. Each step slows the die by `decel × (1 ± friction)`, adds the distance to `travel` and moves it. At a board edge it bounces back and loses up to `bounceLoss` of its speed. It stops when its speed reaches 0 (or after 4,000 steps).
4. `tumbles = floor(travel)`, and `face = TUMBLE_ORDER[(indexOf(startFace) + tumbles) % 6]`.

**Keeping it the same everywhere.** The function uses only `+ − × ÷` and `Math.sqrt`, which give identical results in every JavaScript engine. `noise` is the sum of four uniforms, centred and scaled, instead of Box–Muller (which needs `log` and `cos`). The direction is turned with the small-angle polynomials `1 − t²/2` and `t − t³/6`. Each phone's animation then matches the server's in practice. The design doesn't depend on that: the server's face is always the one shown.

**Validating a swipe** (`validSwipe(swipe, color)`): all four numbers are finite, and the start point is inside that colour's home base. Speeds above `maxSpeed` are capped, not refused.

## Tuning

Measured in the prototype on a 16 × 9 table, 8,000–20,000 simulated throws each. A "casual" player throws a comfortable 2–14 tumbles past the minimum with 10% speed error. An "expert" has learned the table: for each starting face it throws at the strength that gives the most 6s, with 2.5% speed error.

| Setting | Casual: chance of a 6 | Expert | Perfect script |
|---|---|---|---|
| No minimum, no randomness | 17% | 96% | 100% |
| Minimum 8, ±3% friction, 10% bounce, no shake | 17% | 62% | — |
| Minimum 12, ±5%, 20%, no shake | 17% | 33% | 67–89% |
| **Minimum 10, ±5%, 20%, 3% shake (chosen)** | **17%** | **34%** | **about 40%** |

At every setting the casual player gets a normal die, so the mode never punishes people who don't care about it.

The board is 15 × 15, not 16 × 9, and throws start in a corner, not in the middle. So the first implementation step is a tuning script (`packages/engine/scripts/tuneThrow.ts`) that runs the same three player models on the real board and sets `decel` and `minTumbles` until the expert is at 30–38% and the perfect script at 45% or less.

## Server

`packages/server/src/room.ts`, in `play()`'s `roll` case, when `room.settings.dice === 'flick'`:

1. Refuse with `illegal` if `msg.swipe` is missing or fails `validSwipe`.
2. Draw `seed` from `ctx.random`. The start face is the last roll in `room.log` (1 if there is none).
3. Run `throwDie`.
   - **It counts.** `apply()` logs `{ type: 'roll', value: face }` as today. The `event` message also carries `throw: { swipe, seed, startFace }`, and `readyAt` uses `result.ms` instead of `ANIMATION_TIMING.roll`.
   - **It's void.** Nothing is logged. Everyone gets `{ t: 'throw', color, throw: { swipe, seed, startFace }, counts: false }`. The room adds 1 to `room.voids`, which resets at each new turn. The deadline doesn't move. On the third void, the server makes the computer's throw for them at once.

`computerAct()` gets the same branch with a computer swipe (see [Computer players](#computer-players)). A covered seat, a computer seat and a timed-out player all go through it.

`room.log` keeps holding only engine events. A device that connects late, or syncs after a gap, gets the board without the throw animations, which is the same as rolls today.

## Protocol

- `Settings` gains `dice?: 'random' | 'flick'`. Missing means `'random'`, so saved local games and old rooms keep working. `validSettings` accepts it missing or as either value, and `cleanSettings` keeps it. `modeOfSettings` ignores it: Ghana with flick dice is still Ghana.
- `ClientMessage` `{ t: 'roll' }` gains `swipe?: Swipe`.
- `ServerMessage` `event` gains `throw?: ShownThrow`, and there is a new `{ t: 'throw'; color: Color; throw: ShownThrow; counts: false }`. `ShownThrow = { swipe: Swipe; seed: number; startFace: number }`.
- `Listing` gains `dice`, so the open room list can show "Flick dice".
- `PROTOCOL_VERSION` goes from 5 to 6.

## The app

**Setup.** A **Dice** choice (Random, Flick) below **After a kick**, for local games and hosted rooms. In a lobby the host changes it with the other settings.

**Throwing.** When it's your roll, the die sits in your home base on the board, showing the face it starts from.
- Drag it anywhere inside your base and let go. The speed comes from the last 80 ms of the drag, in squares per second.
- The die can't be dragged out of your base. The drag pins at its edge, but the throw still goes.
- **Throw for me** in the roll tray throws a random comfortable swipe (the casual model). It's the way to throw with a keyboard, and for anyone who can't drag.
- A small ruler along your side of the board marks the minimum distance in squares while you hold the die.

**Showing a throw.** Every device animates `throwPath(swipe, seed, startFace)` across the board, a quarter-turn per square in the direction of travel, in a layer next to `BoardFx`. The last frame always shows the face the server sent. A void throw ends with the die shaking and "Too short, throw again". With `prefers-reduced-motion`, the die moves to where it stops without tumbling.

**Local games.** `useGame`'s `roll` intent carries the swipe. The device runs `throwDie` with a seed from `crypto.getRandomValues`, or from `seededDice` under `?seed=`. `?dice=6,6,3` scripted dice skip the throw and are dev-only, as now.

## Computer players

A computer aims for a 6 (the engine's bot doesn't need to choose a face yet). For each starting face it uses a checked-in aiming table `THROW_AIM[startFace] = { x, y, angle, speed }`, generated by the tuning script as the expert's best throw on the board. Then it adds its level's error:

| Level | Aim | Speed error |
|---|---|---|
| Easy | none: a casual throw | 10% |
| Normal | the aiming table | 6% |
| Expert | the aiming table | 2.5% |

## Testing

**Engine**
- The same swipe, seed and start face always give the same result.
- The tumble order, the minimum, the speed cap, bounces at all four edges, and `validSwipe` (non-finite numbers, starts outside the base).
- Statistics: seeded, 20,000 throws each.
  - The casual model gives every face 14–20%.
  - The expert bot gets a 6 28–38% of the time.
  - The best swipe from the aiming table, with no error at all, gets a 6 at most 45% of the time.
  - These tests guard the tuning against later changes.

**Server**
- A flick roll with a fixed `random` logs `throwDie`'s face and sends `throw` on the event.
- A missing or bad swipe is refused.
- A void throw logs nothing, broadcasts `throw` with `counts: false`, and leaves the deadline alone. The third void makes the computer throw.
- `readyAt` follows the throw's length.
- Rooms with `dice` missing behave exactly as now.

**App**
- A drag becomes the right swipe in squares.
- A drag is held inside the home base.
- The animation ends on the server's face even when the replay disagrees.
- An e2e test: two players in a flick room, one throws, both see the same face.

## Open questions

- Should the minimum go up after each 6 in a turn, so a run of 6s gets harder? The prototype can measure this before deciding.
- Once players have tried it, is three void throws too many or too few?
- Should spectators see the swipe's direction as a trail? It helps people learn by watching, which is good for the mode, but it also shows exactly how the best players throw.
