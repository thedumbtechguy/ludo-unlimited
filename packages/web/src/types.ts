import type { Color } from '@ludo/engine'

export type Seat = 'human' | 'computer'
export type Seats = Partial<Record<Color, Seat>>
/** Which side of the board the viewer's yard is drawn on: a per-device preference, not a game setting. */
export type Hand = 'right' | 'left'
/** How much the effects layer shows: a per-device preference, like the hand. */
export type EffectsLevel = 'full' | 'reduced'
/** The colour theme chosen on this device: follow the system, or always light or dark. */
export type ThemePref = 'system' | 'light' | 'dark'
/** The theme actually shown, once `system` is resolved. */
export type Theme = 'light' | 'dark'
