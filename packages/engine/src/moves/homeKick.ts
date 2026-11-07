import { LANE_LENGTH, entryIndex } from '../board'
import { loneOpponent } from '../occupancy'
import { forwardPath, isClear } from '../path'
import { lane } from '../position'
import { positionOf } from '../state'
import { COLORS, type GameState, type Move, type PieceId } from '../types'

export function homeKickMoves(state: GameState, piece: PieceId, roll: number): Move[] {
  if (!state.settings.rules.homeKick) return []
  const from = positionOf(state, piece)
  if (from.kind !== 'track') return []
  // route[k] is where the piece stands after k normal steps.
  const route = [from, ...(forwardPath(piece.color, from, roll - 1) ?? [])]
  return route.flatMap((pos, k): Move[] => {
    if (pos.kind !== 'track') return []
    const index = pos.index
    const owner = COLORS.find((c) => c !== piece.color && entryIndex(c) === index)
    const depth = roll - k
    if (!owner || depth > LANE_LENGTH) return []
    const to = lane(owner, depth)
    const path = [...route.slice(1, k + 1), ...Array.from({ length: depth }, (_, i) => lane(owner, i + 1))]
    const kick = loneOpponent(state, to, piece.color)
    return kick && isClear(state, path, piece.color) ? [{ kind: 'homeKick', piece, to, kick }] : []
  })
}
