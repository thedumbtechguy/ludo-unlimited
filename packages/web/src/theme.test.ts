import { describe, expect, it } from 'vitest'
import html from '../index.html?raw'
import { COLOR_HEX, ON_COLOR, TABLE } from './theme'

describe('theme', () => {
  it('loads Inter 500–900 only', () => {
    expect(html).toContain('family=Inter:wght@500;600;700;800;900')
    expect(html).not.toContain('Space+Grotesk')
  })

  it('paints every screen plain white, with one fixed blue for buttons', () => {
    expect(TABLE).toEqual({ table: '#FFFFFF', text: '#000000', muted: '#6E6E73', line: 'rgba(0, 0, 0, 0.12)', button: '#007AFF' })
  })

  it('keeps secondary text readable: muted on white is at least 4.5:1', () => {
    const lum = (hex: string) => {
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
      return 0.2126 * r + 0.7152 * g + 0.0722 * b
    }
    expect((lum(TABLE.table) + 0.05) / (lum(TABLE.muted) + 0.05)).toBeGreaterThanOrEqual(4.5)
  })

  it('uses dark brown text on yellow, white on the rest', () => {
    expect(COLOR_HEX).toEqual({ red: '#e5484d', green: '#30a46c', yellow: '#f5b301', blue: '#3e63dd' })
    expect(ON_COLOR).toEqual({ red: '#ffffff', green: '#ffffff', yellow: '#3d2a00', blue: '#ffffff' })
  })
})
