import type { Color, Move, PieceId, Position } from '@ludo/engine'

export const COLOR_NAME: Record<Color, string> = { red: 'Red', green: 'Green', yellow: 'Yellow', blue: 'Blue' }

export function describePosition(pos: Position): string {
  switch (pos.kind) {
    case 'base':
      return 'in base'
    case 'home':
      return 'home'
    case 'track':
      return `on square ${pos.index + 1}`
    case 'lane':
      return `in ${COLOR_NAME[pos.owner]}'s home lane, square ${pos.index}`
  }
}

export const pieceLabel = (piece: PieceId, pos: Position): string =>
  `${COLOR_NAME[piece.color]} piece ${piece.index + 1}, ${describePosition(pos)}`

export const targetLabel = (move: Move): string =>
  move.kick ? `Kick ${COLOR_NAME[move.kick.color]} ${describePosition(move.to)}` : `Move ${describePosition(move.to)}`

const KICK_VERB: Record<Move['kind'], string> = {
  enter: 'kicked',
  forward: 'kicked',
  back: 'Back Kicked',
  line: 'Line Kicked',
  homeKick: 'Home Kicked',
}

export const kickMessage = (move: Move): string | undefined =>
  move.kick ? `${COLOR_NAME[move.piece.color]} ${KICK_VERB[move.kind]} ${COLOR_NAME[move.kick.color]}!` : undefined
