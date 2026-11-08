import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { applyTheme, resolveTheme, useTheme } from './useTheme'
import type { ThemePref } from './types'

/** A prefers-color-scheme query whose answer the test can flip, telling its listeners. */
function fakeSystem(dark: boolean) {
  const listeners = new Set<(e: { matches: boolean }) => void>()
  const query = {
    get matches() {
      return dark
    },
    addEventListener: (_: string, fn: (e: { matches: boolean }) => void) => listeners.add(fn),
    removeEventListener: (_: string, fn: (e: { matches: boolean }) => void) => listeners.delete(fn),
  }
  vi.stubGlobal('matchMedia', (q: string) => (q === '(prefers-color-scheme: dark)' ? query : { matches: false, addEventListener() {}, removeEventListener() {} }))
  return {
    listeners,
    set(next: boolean) {
      dark = next
      listeners.forEach((fn) => fn({ matches: next }))
    },
  }
}

const original = matchMedia
const html = document.documentElement
const meta = () => document.querySelector('meta[name="theme-color"]')!

describe('theme', () => {
  beforeEach(() => {
    const tag = document.createElement('meta')
    tag.name = 'theme-color'
    tag.content = '#FFFFFF'
    document.head.append(tag)
  })
  afterEach(() => {
    vi.stubGlobal('matchMedia', original)
    meta().remove()
    delete html.dataset.theme
  })

  it('resolves system from the device, and light or dark as chosen', () => {
    expect(resolveTheme('system', false)).toBe('light')
    expect(resolveTheme('system', true)).toBe('dark')
    expect(resolveTheme('light', true)).toBe('light')
    expect(resolveTheme('dark', false)).toBe('dark')
  })

  it('applies a theme as data-theme on <html>, with the status bar colour to match', () => {
    applyTheme('dark')
    expect(html.dataset.theme).toBe('dark')
    expect(meta()).toHaveAttribute('content', '#000000')
    applyTheme('light')
    expect(html.dataset.theme).toBe('light')
    expect(meta()).toHaveAttribute('content', '#FFFFFF')
  })

  it('follows the system, live, while set to System', () => {
    const system = fakeSystem(true)
    const { result } = renderHook(() => useTheme('system'))
    expect(result.current).toBe('dark')
    expect(html.dataset.theme).toBe('dark')
    act(() => system.set(false))
    expect(result.current).toBe('light')
    expect(html.dataset.theme).toBe('light')
    expect(meta()).toHaveAttribute('content', '#FFFFFF')
    act(() => system.set(true))
    expect(html.dataset.theme).toBe('dark')
  })

  it('ignores the system while set to Light or Dark, and picks it up again on System', () => {
    const system = fakeSystem(false)
    const { result, rerender } = renderHook(({ pref }: { pref: ThemePref }) => useTheme(pref), { initialProps: { pref: 'dark' } })
    expect(html.dataset.theme).toBe('dark')
    act(() => system.set(true))
    rerender({ pref: 'light' })
    expect(result.current).toBe('light')
    rerender({ pref: 'system' })
    expect(result.current).toBe('dark')
    expect(html.dataset.theme).toBe('dark')
  })

  it('stops listening when unmounted', () => {
    const system = fakeSystem(false)
    const { unmount } = renderHook(() => useTheme('system'))
    expect(system.listeners.size).toBe(1)
    unmount()
    expect(system.listeners.size).toBe(0)
  })
})
