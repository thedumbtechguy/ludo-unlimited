import { useEffect, useLayoutEffect, useState } from 'react'
import { THEME_COLOR } from './theme'
import type { Theme, ThemePref } from './types'

const DARK_QUERY = '(prefers-color-scheme: dark)'

export const resolveTheme = (pref: ThemePref, systemDark: boolean): Theme => (pref === 'system' ? (systemDark ? 'dark' : 'light') : pref)

/** Shows `theme`: `data-theme` on <html>, and the status bar colour to match. */
export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLOR[theme])
}

/** Whether the system is in dark mode, kept up to date while the app is open. */
function useSystemDark(): boolean {
  const [dark, setDark] = useState(() => matchMedia(DARK_QUERY).matches)
  useEffect(() => {
    const query = matchMedia(DARK_QUERY)
    const change = (e: MediaQueryListEvent) => setDark(e.matches)
    setDark(query.matches)
    query.addEventListener('change', change)
    return () => query.removeEventListener('change', change)
  }, [])
  return dark
}

/** Resolves the preference (following the system live for `system`) and applies it to the page. */
export function useTheme(pref: ThemePref): Theme {
  const theme = resolveTheme(pref, useSystemDark())
  useLayoutEffect(() => applyTheme(theme), [theme])
  return theme
}
