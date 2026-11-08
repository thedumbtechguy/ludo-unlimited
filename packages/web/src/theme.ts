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
  yellow: '#3d2a00',
  blue: '#ffffff',
}

export const BOARD_BG = '#cbd5e1'
export const TILE = '#ffffff'
export const MOVE_MARK = '#3e63dd'
export const KICK_MARK = '#e5484d'

/** The table every screen sits on; mirrored as CSS custom properties in styles.css. */
export const TABLE = { table: '#1F5B57', text: '#F3E9D2', muted: '#A9CBC5', line: 'rgba(243, 233, 210, 0.16)' }
