import { act, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TurnClock } from './TurnClock'

describe('TurnClock', () => {
  afterEach(() => vi.useRealTimers())

  it('drains to the deadline in the player’s colour, pulsing for the last 10 seconds', () => {
    vi.useFakeTimers()
    render(<TurnClock deadline={Date.now() + 30_000} total={30_000} color="#2EA36B" />)
    const ring = screen.getByRole('img')
    expect(ring).toHaveAccessibleName('30 seconds left')
    expect(ring).not.toHaveClass('warn')
    expect(ring.querySelector('circle')).toHaveStyle({ stroke: '#2EA36B' })
    act(() => vi.advanceTimersByTime(21_000))
    expect(ring).toHaveAccessibleName('9 seconds left')
    expect(ring).toHaveClass('warn')
    act(() => vi.advanceTimersByTime(10_000))
    expect(ring).toHaveAccessibleName('0 seconds left')
    expect(ring.querySelector('circle')).toHaveAttribute('stroke-dasharray', '0 1')
  })
})
