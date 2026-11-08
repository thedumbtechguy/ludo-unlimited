import { TRACK_LENGTH, entryIndex } from './board'
import type { Color, Position } from './types'

/**
 * How far along `color`'s route a position is: start square 0, own lane entry 50, own lane 51–55,
 * home 56, base −1. Measured by squares left to home, so kick shortcuts count as real progress.
 */
export function progress(color: Color, pos: Position): number {
  const toEntry = (index: number) => (entryIndex(color) - index + TRACK_LENGTH) % TRACK_LENGTH
  switch (pos.kind) {
    case 'base':
      return -1
    case 'home':
      return 56
    case 'track':
      return 50 - toEntry(pos.index)
    case 'lane':
      return pos.owner === color ? 50 + pos.index : 50 - pos.index - toEntry(entryIndex(pos.owner))
  }
}
