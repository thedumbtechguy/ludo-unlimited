import { describe, expect, it } from 'vitest'
import html from '../index.html?raw'
import css from './styles.css?raw'
import { COLOR_HEX, DARK_TABLE, ON_COLOR, TABLE, THEME_COLOR } from './theme'

const lum = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const contrast = (a: string, b: string) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05)
/** The value of a custom property in one block of styles.css. */
const token = (selector: string, name: string) => {
  const block = css.slice(css.indexOf(`${selector} {`))
  return block.slice(0, block.indexOf('}')).match(new RegExp(`${name}: ([^;]+);`))![1]
}

describe('theme', () => {
  it('loads Inter 500–900 only', () => {
    expect(html).toContain('family=Inter:wght@500;600;700;800;900')
    expect(html).not.toContain('Space+Grotesk')
  })

  it('paints every screen plain white, with one fixed blue for buttons', () => {
    expect(TABLE).toEqual({ table: '#FFFFFF', text: '#000000', muted: '#6E6E73', line: 'rgba(0, 0, 0, 0.12)', button: '#007AFF' })
  })

  it('keeps secondary text readable: muted on white is at least 4.5:1', () => {
    expect(contrast(TABLE.table, TABLE.muted)).toBeGreaterThanOrEqual(4.5)
  })

  describe('dark', () => {
    it('mirrors the dark tokens in styles.css', () => {
      const dark = ':root[data-theme="dark"]'
      expect(token(dark, '--table')).toBe(DARK_TABLE.table)
      expect(token(dark, '--text')).toBe(DARK_TABLE.text)
      expect(token(dark, '--muted')).toBe(DARK_TABLE.muted)
      expect(token(dark, '--line')).toBe(DARK_TABLE.line)
      expect(token(dark, '--button-bg')).toBe(DARK_TABLE.button)
      expect(token(dark, '--sheet-bg')).toBe(DARK_TABLE.sheet)
      expect(token(':root', '--table')).toBe(TABLE.table)
    })

    it('keeps muted text at least 4.5:1 on the page and on sheets', () => {
      expect(contrast(DARK_TABLE.table, DARK_TABLE.muted)).toBeGreaterThanOrEqual(4.5)
      expect(contrast(DARK_TABLE.sheet, DARK_TABLE.muted)).toBeGreaterThanOrEqual(4.5)
    })

    it('keeps the streak count readable on the page in both themes', () => {
      expect(contrast(TABLE.table, token(':root', '--streak'))).toBeGreaterThanOrEqual(4.5)
      expect(contrast(DARK_TABLE.table, token(':root[data-theme="dark"]', '--streak'))).toBeGreaterThanOrEqual(4.5)
    })

    it('sets the theme in index.html before first paint, with the same status bar colours', () => {
      const head = html.slice(0, html.indexOf('</head>'))
      expect(head).toContain("localStorage.getItem('ludo-unlimited:theme')")
      expect(head).toContain('(prefers-color-scheme: dark)')
      expect(head).toContain(`theme === 'dark' ? '${THEME_COLOR.dark}' : '${THEME_COLOR.light}'`)
    })
  })

  it('uses dark brown text on yellow, white on the rest', () => {
    expect(COLOR_HEX).toEqual({ red: '#e5484d', green: '#30a46c', yellow: '#f5b301', blue: '#3e63dd' })
    expect(ON_COLOR).toEqual({ red: '#ffffff', green: '#ffffff', yellow: '#3d2a00', blue: '#ffffff' })
  })
})
