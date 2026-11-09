import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { QuickMatch } from './QuickMatch'

const props = () => ({ mode: 'ghana' as const, onMode: vi.fn(), busy: false, onGo: vi.fn(), onCancel: vi.fn(), onBack: vi.fn() })

describe('QuickMatch', () => {
  it('picks the rules and goes', async () => {
    const p = props()
    render(<QuickMatch {...p} />)
    expect(screen.getByRole('button', { name: /^Rules/ })).toHaveTextContent('Ghana kicks')
    await userEvent.click(screen.getByRole('button', { name: /^Rules/ }))
    await userEvent.click(screen.getByRole('radio', { name: 'Classic' }))
    expect(p.onMode).toHaveBeenCalledWith('classic')
    await userEvent.click(screen.getByRole('button', { name: 'Go' }))
    expect(p.onGo).toHaveBeenCalled()
  })

  it('while finding, says so and can cancel', async () => {
    const p = props()
    render(<QuickMatch {...p} busy />)
    expect(screen.getByRole('status')).toHaveTextContent('Finding a game…')
    expect(screen.queryByRole('button', { name: 'Go' })).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(p.onCancel).toHaveBeenCalled()
  })

  it('an error offers Try again', async () => {
    const p = props()
    render(<QuickMatch {...p} error="Couldn’t find a game." />)
    expect(screen.getByRole('alert')).toHaveTextContent('Couldn’t find a game.')
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(p.onGo).toHaveBeenCalled()
  })
})
