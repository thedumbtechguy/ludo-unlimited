import { describe, expect, it } from 'vitest'
import html from '../index.html?raw'
import { COLOR_HEX, ON_COLOR, TABLE } from './theme'

describe('theme', () => {
  it('loads Inter 500–900 only', () => {
    expect(html).toContain('family=Inter:wght@500;600;700;800;900')
    expect(html).not.toContain('Space+Grotesk')
  })

  it('paints every screen on the teal table', () => {
    expect(TABLE).toEqual({ table: '#1F5B57', text: '#F3E9D2', muted: '#A9CBC5', line: 'rgba(243, 233, 210, 0.16)' })
  })

  it('uses dark brown text on yellow, white on the rest', () => {
    expect(COLOR_HEX).toEqual({ red: '#e5484d', green: '#30a46c', yellow: '#f5b301', blue: '#3e63dd' })
    expect(ON_COLOR).toEqual({ red: '#ffffff', green: '#ffffff', yellow: '#3d2a00', blue: '#ffffff' })
  })
})
