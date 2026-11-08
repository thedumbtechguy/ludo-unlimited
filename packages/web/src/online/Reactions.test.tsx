import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ReactionBubbles, ReactionButton } from './Reactions'

describe('reactions', () => {
  it('opens six presets; picking one sends it and closes the tray', async () => {
    const onReact = vi.fn()
    render(<ReactionButton onReact={onReact} />)
    await userEvent.click(screen.getByRole('button', { name: 'React' }))
    const tray = screen.getByRole('dialog', { name: 'React' })
    expect(tray.querySelectorAll('.reaction-choice')).toHaveLength(6)
    await userEvent.click(screen.getByRole('button', { name: '🔥' }))
    expect(onReact).toHaveBeenCalledWith('fire')
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('rests for 3 seconds after a reaction, as the room does', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    render(<ReactionButton onReact={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: 'React' }))
    await userEvent.click(screen.getByRole('button', { name: '🔥' }))
    expect(screen.getByRole('button', { name: 'React' })).toBeDisabled()
    act(() => vi.advanceTimersByTime(2900))
    expect(screen.getByRole('button', { name: 'React' })).toBeDisabled()
    act(() => vi.advanceTimersByTime(100))
    expect(screen.getByRole('button', { name: 'React' })).toBeEnabled()
    vi.useRealTimers()
  })

  it('pops each reaction over its sender’s yard, turned with the board', () => {
    const { rerender } = render(<ReactionBubbles reactions={[{ id: 1, color: 'red', reaction: 'hurry' }]} turn={0} names={{ red: 'Ama' }} />)
    const bubble = screen.getByText('Hurry up')
    // Red's yard is top-left unturned, so its middle is at (120, 120).
    expect(bubble.style.left).toBe('20%')
    expect(bubble.style.top).toBe('20%')
    rerender(<ReactionBubbles reactions={[{ id: 1, color: 'red', reaction: 'hurry' }]} turn={1} names={{ red: 'Ama' }} />)
    expect(screen.getByText('Hurry up').style.left).toBe('80%')
  })

  it('names the sender for screen readers', () => {
    render(<ReactionBubbles reactions={[{ id: 1, color: 'yellow', reaction: 'fire' }]} turn={0} names={{ yellow: 'Kofi' }} />)
    expect(screen.getByRole('status', { name: 'Kofi: 🔥' })).toBeInTheDocument()
  })
})
