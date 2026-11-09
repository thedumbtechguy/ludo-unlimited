import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useSecondsLeft } from './useSecondsLeft'

describe('useSecondsLeft', () => {
  afterEach(() => vi.useRealTimers())

  it('counts whole seconds down to the time, and stops at 0', () => {
    vi.useFakeTimers()
    const at = Date.now() + 2500
    const { result } = renderHook(() => useSecondsLeft(at))
    expect(result.current).toBe(3)
    act(() => vi.advanceTimersByTime(1000))
    expect(result.current).toBe(2)
    act(() => vi.advanceTimersByTime(5000))
    expect(result.current).toBe(0)
  })

  it('is undefined without a time', () => {
    expect(renderHook(() => useSecondsLeft(undefined)).result.current).toBeUndefined()
  })
})
