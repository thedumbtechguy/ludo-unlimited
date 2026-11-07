import type { Color, Position } from './types'

export const BASE: Position = { kind: 'base' }
export const HOME: Position = { kind: 'home' }
export const track = (index: number): Position => ({ kind: 'track', index })
export const lane = (owner: Color, index: number): Position => ({ kind: 'lane', owner, index })

export function posKey(pos: Position): string {
  switch (pos.kind) {
    case 'track':
      return `t${pos.index}`
    case 'lane':
      return `l-${pos.owner}-${pos.index}`
    default:
      return pos.kind
  }
}

export const samePos = (a: Position, b: Position): boolean => posKey(a) === posKey(b)

export const isOnBoard = (pos: Position): boolean => pos.kind === 'track' || pos.kind === 'lane'
