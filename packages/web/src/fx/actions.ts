import type { Color, GameState, PieceId, Position } from '@ludo/engine'
import { positionPoint, yardOrigin, type Point } from '../layout'
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
  /** A back kick: the kicker lunges on, speed lines streaming out behind it. `from` is the square it came from. */
  | { type: 'whip'; at: Point; from: Point; kicker: PieceId; count: number }
  | { type: 'bolt'; from: Point; to: Point; color: Color }
  | { type: 'ripple'; squares: Point[]; color: Color }
  | { type: 'smoke'; at: Point; count: number }
  /** Chains slam over the victim's yard (`id` tells one Labourer from the next). */
  | { type: 'chains'; victim: Color; id: number }
  | { type: 'shatter'; victim: Color; count: number }
  /** A white shimmer sweeping across a new block's pieces. */
  | { type: 'shimmer'; at: Position; color: Color; id: number }
  | { type: 'fountain'; at: Point; color: Color; count: number }
  | { type: 'burst'; at: Point; color: Color; count: number }
  | { type: 'fireworks'; color: Color; rockets: number; count: number }
  /** `waves` bursts of `count` each, falling one after another from the top of the board. */
  | { type: 'confetti'; count: number; waves: number }

export const SPARKS = 44
export const SPEED_LINES = 10
export const SMOKE = 28
export const SHARDS = 48
export const FOUNTAIN = 60
export const FINISH_BURST = 40
export const ROCKETS = 3
/** Sparks in each rocket's burst. */
export const SHELL = 56
/** Confetti in each of the win's waves. */
export const CONFETTI = 60
export const CONFETTI_WAVES = 3
const LANE = [1, 2, 3, 4, 5]

/** The middle of a colour's yard. */
export const yardCentre = (color: Color): Point => {
  const o = yardOrigin(color)
  return { x: o.x + 120, y: o.y + 120 }
}

/** The square a piece stands on (any piece will do off the base and home). */
const square = (at: Position, piece: PieceId): Point => positionPoint(at, piece)

/** `state` is the game as it is with the effect applied (whose win it was). */
export function effectActions(effect: EffectEvent, level: EffectsLevel, state: GameState): FxAction[] {
  const full = level === 'full'
  const shake = (px: number, ms: number): FxAction[] => (full ? [{ type: 'shake', px, ms }] : [])
  switch (effect.type) {
    case 'kick': {
      const { kicker, kind } = effect
      const at = square(effect.at, kicker)
      const color = kicker.color
      const impact: FxAction[] = [
        { type: 'flash', at, color },
        { type: 'sparks', at, color, count: SPARKS },
        ...shake(5, 200),
      ]
      switch (kind) {
        case 'front':
          return impact
        case 'back': {
          const whip: FxAction[] = effect.from ? [{ type: 'whip', at, from: square(effect.from, kicker), kicker, count: SPEED_LINES }] : []
          return [...impact, ...whip]
        }
        case 'line':
          return effect.via ? [{ type: 'bolt', from: square(effect.via, kicker), to: at, color }, ...impact] : impact
        case 'home': {
          const owner = effect.at.kind === 'lane' ? effect.at.owner : effect.victim.color
          const squares = LANE.map((index) => square({ kind: 'lane', owner, index }, kicker))
          return [...impact, { type: 'ripple', squares, color }]
        }
      }
    }
    // On top of the kick it follows: dark smoke rolling up, and a harder shake.
    case 'wicked':
      return [{ type: 'smoke', at: square(effect.at, effect.piece), count: SMOKE }, ...shake(6, 200)]
    case 'labourerStart':
      return [{ type: 'chains', victim: effect.victim, id: effect.id }, ...shake(3, 140)]
    case 'labourerFreed':
      return [{ type: 'shatter', victim: effect.victim, count: SHARDS }]
    case 'blockFormed':
      return [{ type: 'shimmer', at: effect.at, color: effect.color, id: effect.id }]
    case 'pieceHome':
      return [{ type: 'fountain', at: positionPoint({ kind: 'home' }, effect.piece), color: effect.piece.color, count: FOUNTAIN }]
    case 'playerFinished': {
      const burst: FxAction = { type: 'burst', at: yardCentre(effect.color), color: effect.color, count: FINISH_BURST }
      // The winner gets the fireworks and confetti, even when play goes on for the other places.
      if (effect.place !== 1) return [burst]
      return [
        burst,
        { type: 'fireworks', color: effect.color, rockets: ROCKETS, count: SHELL },
        { type: 'confetti', count: CONFETTI, waves: CONFETTI_WAVES },
      ]
    }
    // Celebrated by the finish that ended it.
    case 'gameOver':
    case 'sixStreak':
    case 'streakEnded':
      return []
  }
}

/**
 * How long the finished board stays up before the results screen, so the last finish can play out:
 * the win's fireworks, confetti and callout when the game ended on the win, or the shorter callout
 * for a later place. None without animations (`?fast`).
 */
export function resultsDelay(enabled: boolean, wonNow: boolean): number {
  if (!enabled) return 0
  return (wonNow ? WIN_CALLOUT_MS : FINISH_CALLOUT_MS) + 300
}

/** How long a finish callout stays up: longer for the win. */
export const WIN_CALLOUT_MS = 3400
export const FINISH_CALLOUT_MS = 2000
