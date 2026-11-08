import { act, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { KickCallout } from './KickCallout'

const callout = { id: 1, title: 'Line kick!', line: 'Red sent Yellow back to base', color: 'red' } as const

describe('KickCallout', () => {
  afterEach(() => vi.useRealTimers())

  it('shows the kick and the message line in the kicker’s colour', () => {
    render(<KickCallout callout={callout} />)
    expect(screen.getByText('Line kick!')).toHaveStyle({ color: '#e5484d' })
    expect(screen.getByText('Red sent Yellow back to base')).toBeInTheDocument()
  })

  it('is decoration only: hidden from screen readers (the status line speaks) and not clickable', () => {
    const { container } = render(<KickCallout callout={callout} />)
    const el = container.querySelector('.kick-callout')!
    expect(el).toHaveAttribute('aria-hidden', 'true')
    expect(el.querySelector('button')).toBeNull()
  })

  it('goes away after 1.4s, and comes back for the next kick', () => {
    vi.useFakeTimers()
    const { rerender } = render(<KickCallout callout={callout} />)
    act(() => vi.advanceTimersByTime(1399))
    expect(screen.getByText('Line kick!')).toBeInTheDocument()
    act(() => vi.advanceTimersByTime(1))
    expect(screen.queryByText('Line kick!')).toBeNull()
    rerender(<KickCallout callout={{ ...callout, id: 2, title: 'Wicked!' }} />)
    expect(screen.getByText('Wicked!')).toBeInTheDocument()
  })

  it('renders nothing without a kick', () => {
    const { container } = render(<KickCallout />)
    expect(container).toBeEmptyDOMElement()
  })
})
