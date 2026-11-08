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

/** Text on the white "Your turn" tag: a deep shade of the yard's colour. */
export const TAG_TEXT: Record<Color, string> = {
  red: '#b0262b',
  green: '#1b6b45',
  yellow: '#3d2a00',
  blue: '#2a45a8',
}

export const INK = '#1d1d1f'
export const MOVE_MARK = '#3e63dd'
export const KICK_MARK = '#e5484d'

/** The page every screen sits on; mirrored as CSS custom properties in styles.css. */
export const TABLE = { table: '#FFFFFF', text: '#000000', muted: '#6E6E73', line: 'rgba(0, 0, 0, 0.12)', button: '#007AFF' }
/** The same tokens in dark mode, mirrored under [data-theme="dark"] in styles.css. */
export const DARK_TABLE = { table: '#000000', text: '#FFFFFF', muted: '#98989D', line: 'rgba(255, 255, 255, 0.14)', button: '#0A84FF', sheet: '#1C1C1E' }

/** The phone's status bar colour for each theme: the page colour. index.html sets it before first paint too. */
export const THEME_COLOR = { light: TABLE.table, dark: DARK_TABLE.table }
