import type { Color } from '@ludo/engine'

export type Seat = 'human' | 'computer'
export type Seats = Partial<Record<Color, Seat>>
/** Which side of the board the viewer's yard is drawn on: a per-device preference, not a game setting. */
export type Hand = 'right' | 'left'
