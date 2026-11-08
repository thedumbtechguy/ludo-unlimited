import { act, render, renderHook, screen } from '@testing-library/react'
import { useRef } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { EffectsLevel } from '../types'
import { FxLayer } from './FxLayer'
import { DiceFire, DIE_DOWN_MS, OnFire, StreakLabel, useSixStreak } from './SixStreak'
import type { EffectEvent } from './stream'

const six = (id: number, count: number): EffectEvent => ({ id, type: 'sixStreak', color: 'red', count })
const ended = (id: number, count: number): EffectEvent => ({ id, type: 'streakEnded', color: 'red', count })

describe('six streak', () => {
  describe('useSixStreak', () => {
    it('follows the streak, and drops to 0 when it ends', () => {
      const { result, rerender } = renderHook(({ effects }) => useSixStreak(effects, 'red'), {
        initialProps: { effects: [] as EffectEvent[] },
      })
      expect(result.current.count).toBe(0)
      rerender({ effects: [six(1, 1), six(2, 2)] })
      expect(result.current).toEqual({ count: 2, six: 2 })
      rerender({ effects: [six(1, 1), six(2, 2), ended(3, 2)] })
      expect(result.current.count).toBe(0)
    })

    it('drops to 0 when the turn moves on', () => {
      const { result, rerender } = renderHook(({ effects, turn }) => useSixStreak(effects, turn), {
        initialProps: { effects: [] as EffectEvent[], turn: 'red' as 'red' | 'green' },
      })
      rerender({ effects: [six(1, 1)], turn: 'red' })
      expect(result.current.count).toBe(1)
      rerender({ effects: [six(1, 1)], turn: 'green' })
      expect(result.current.count).toBe(0)
    })
  })

  function Streak({ count, level, enabled = true }: { count: number; level: EffectsLevel; enabled?: boolean }) {
    const dice = useRef<HTMLDivElement>(null)
    return (
      <FxLayer level={level} enabled={enabled}>
        <div ref={dice} />
        <DiceFire dice={dice} streak={{ count, six: count }} />
        <OnFire count={count} place="phone" />
        <StreakLabel count={count} />
      </FxLayer>
    )
  }

  it('says "On fire" from four 6s, and lets it die down when the streak ends', () => {
    vi.useFakeTimers()
    const { rerender } = render(<Streak count={3} level="full" />)
    expect(screen.queryByText('On fire')).toBeNull()
    rerender(<Streak count={4} level="full" />)
    expect(screen.getByText('On fire')).not.toHaveClass('leaving')
    rerender(<Streak count={0} level="full" />)
    expect(screen.getByText('On fire')).toHaveClass('leaving')
    act(() => vi.advanceTimersByTime(DIE_DOWN_MS))
    expect(screen.queryByText('On fire')).toBeNull()
    vi.useRealTimers()
  })

  it('reduced effects show a still "6 × 3" instead of fire and the banner', () => {
    const { rerender } = render(<Streak count={1} level="reduced" />)
    expect(screen.queryByText(/6 ×/)).toBeNull()
    rerender(<Streak count={4} level="reduced" />)
    expect(screen.getByText('6 × 4')).toBeInTheDocument()
    expect(screen.queryByText('On fire')).toBeNull()
  })

  it('full effects show no "6 × 3" label', () => {
    render(<Streak count={3} level="full" />)
    expect(screen.queryByText(/6 ×/)).toBeNull()
  })

  it('shows nothing when effects are off (instant timing)', () => {
    render(<Streak count={5} level="full" enabled={false} />)
    expect(screen.queryByText('On fire')).toBeNull()
    expect(screen.queryByText(/6 ×/)).toBeNull()
    expect(document.querySelector('canvas')).toBeNull()
  })

  it('pops the dice once per 6, with full effects', () => {
    const animate = vi.spyOn(Element.prototype, 'animate')
    const { rerender } = render(<Streak count={1} level="full" />)
    rerender(<Streak count={1} level="full" />)
    expect(animate).toHaveBeenCalledTimes(1)
    rerender(<Streak count={2} level="full" />)
    expect(animate).toHaveBeenCalledTimes(2)
    animate.mockRestore()
  })
})
