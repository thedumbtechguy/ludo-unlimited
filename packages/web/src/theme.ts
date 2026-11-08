import type { Color } from '@ludo/engine'

export const COLOR_HEX: Record<Color, string> = {
  red: '#e5484d',
  green: '#30a46c',
  yellow: '#f5b301',
  blue: '#3e63dd',
}

/** Text that stays readable on each colour. */
export const ON_COLOR: Record<Color, string> = {
  red: '#ffffff',
  green: '#ffffff',
  yellow: '#0f172a',
  blue: '#ffffff',
}

export const BOARD_BG = '#cbd5e1'
export const TILE = '#ffffff'
export const MOVE_MARK = '#3e63dd'
export const KICK_MARK = '#e5484d'
