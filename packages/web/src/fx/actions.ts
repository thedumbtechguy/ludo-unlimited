import { forwardPath, track, TRACK, type Color, type GameState, type PieceId, type Position } from '@ludo/engine'
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
  | { type: 'confetti'; count: number }

export const SPARKS = 44
export const SPEED_LINES = 10
export const SMOKE = 28
export const SHARDS = 48
export const FOUNTAIN = 60
export const FINISH_BURST = 40
export const ROCKETS = 3
/** Sparks in each rocket's burst. */
export const SHELL = 56
export const CONFETTI = 120
const LANE = [1, 2, 3, 4, 5]

/** The middle of a colour's yard. */
export const yardCentre = (color: Color): Point => {
  const o = yardOrigin(color)
  return { x: o.x + 120, y: o.y + 120 }
}

/** The square a piece stands on (any piece will do off the base and home). */
const square = (at: Position, piece: PieceId): Point => positionPoint(at, piece)

/**
 * The square a backward-moving kicker stepped off to land on `at`: the next one along the track,
 * or for the wicked move (out of its own lane), the next one along its own route.
 */
export function cameFrom(kind: 'back' | 'wicked', at: Position, kicker: PieceId): Position | undefined {
  if (at.kind !== 'track') return undefined
  return kind === 'back' ? track((at.index + 1) % TRACK.length) : forwardPath(kicker.color, at, 1)?.[0]
}

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
        ...shake(kind === 'wicked' ? 6 : 5, 200),
      ]
      switch (kind) {
        case 'front':
          return impact
        case 'back':
        case 'wicked': {
          const from = cameFrom(kind, effect.at, kicker)
          const whip: FxAction[] = from ? [{ type: 'whip', at, from: square(from, kicker), kicker, count: SPEED_LINES }] : []
          return kind === 'back' ? [...impact, ...whip] : [...impact, ...whip, { type: 'smoke', at, count: SMOKE }]
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
    case 'labourerStart':
      return [{ type: 'chains', victim: effect.victim, id: effect.id }, ...shake(3, 140)]
    case 'labourerFreed':
      return [{ type: 'shatter', victim: effect.victim, count: SHARDS }]
    case 'blockFormed':
      return [{ type: 'shimmer', at: effect.at, color: effect.color, id: effect.id }]
    case 'pieceHome':
      return [{ type: 'fountain', at: positionPoint({ kind: 'home' }, effect.piece), color: effect.piece.color, count: FOUNTAIN }]
    case 'playerFinished':
      return [{ type: 'burst', at: yardCentre(effect.color), color: effect.color, count: FINISH_BURST }]
    case 'gameOver': {
      const winner = state.players.find((p) => p.finishedPlace === 1)?.color ?? state.turn
      return [
        { type: 'fireworks', color: winner, rockets: ROCKETS, count: SHELL },
        { type: 'confetti', count: CONFETTI },
      ]
    }
    case 'sixStreak':
    case 'streakEnded':
      return []
  }
}

/**
 * How long the finished board stays up before the results screen, so the win can play out: the
 * fireworks and confetti on full effects, their short reduced form otherwise, none with effects off.
 */
export function resultsDelay(enabled: boolean, level: EffectsLevel): number {
  if (!enabled) return 0
  return level === 'full' ? 1600 : 800
}
