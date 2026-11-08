import type { Color, PieceId, Position } from '@ludo/engine'
import { positionPoint, type Point } from '../layout'
import type { EffectsLevel } from '../types'
import type { EffectEvent } from './stream'

/**
 * What to show for one game effect, in board units (unturned, as `layout` draws them). Particle
 * counts are for full effects; the effects layer cuts them to a tenth when reduced.
 */
export type FxAction =
  | { type: 'flash'; at: Point; color: Color }
  | { type: 'sparks'; at: Point; color: Color; count: number }
  | { type: 'shake'; px: number; ms: number }

export const SPARKS = 44

/** The square a piece stands on (any piece will do off the base and home). */
const square = (at: Position, piece: PieceId): Point => positionPoint(at, piece)

export function effectActions(effect: EffectEvent, level: EffectsLevel): FxAction[] {
  const full = level === 'full'
  const shake = (px: number, ms: number): FxAction[] => (full ? [{ type: 'shake', px, ms }] : [])
  switch (effect.type) {
    case 'kick': {
      const at = square(effect.at, effect.kicker)
      const color = effect.kicker.color
      return [{ type: 'flash', at, color }, { type: 'sparks', at, color, count: SPARKS }, ...shake(effect.kind === 'wicked' ? 6 : 5, 200)]
    }
    default:
      return []
  }
}
