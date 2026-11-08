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
