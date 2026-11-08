import type { Color } from '@ludo/engine'

export type Seat = 'human' | 'computer'
export type Seats = Partial<Record<Color, Seat>>
