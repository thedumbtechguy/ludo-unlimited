import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Home } from './Home'

const renderHome = (canContinue: boolean, onNew = () => {}, onContinue = () => {}, onOnline = () => {}) =>
  render(<Home canContinue={canContinue} hand="right" onNew={onNew} onContinue={onContinue} onOnline={onOnline} />)

describe('Home', () => {
  it('has the title, one line of description and New game as the main button', async () => {
    const onNew = vi.fn()
    renderHome(false, onNew)
    expect(screen.getByRole('heading', { level: 1, name: 'Ludo Unlimited' })).toBeInTheDocument()
    expect(screen.getByText('Ludo with Ghanaian kicks.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'New game' })).toHaveClass('primary')
    await userEvent.click(screen.getByRole('button', { name: 'New game' }))
    expect(onNew).toHaveBeenCalled()
  })

  it('offers Continue only for a saved game', async () => {
    const onContinue = vi.fn()
    const { unmount } = renderHome(false)
    expect(screen.queryByRole('button', { name: 'Continue' })).toBeNull()
    unmount()
    renderHome(true, () => {}, onContinue)
    expect(screen.getByRole('button', { name: 'Continue' })).toHaveClass('secondary')
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }))
    expect(onContinue).toHaveBeenCalled()
  })

  it('shows the board under the buttons, static, in its starting position', () => {
    renderHome(true)
    expect(screen.getAllByTestId('piece')).toHaveLength(16)
    // Only the buttons: nothing on the board is interactive, and it is hidden from screen readers.
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual(['New game', 'Continue', 'Play online'])
    const board = document.querySelector('.home-board')!
    expect(board).toHaveAttribute('aria-hidden', 'true')
    expect(screen.getByRole('button', { name: 'Play online' }).compareDocumentPosition(board) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('offers Play online after the local game', async () => {
    const onOnline = vi.fn()
    renderHome(false, () => {}, () => {}, onOnline)
    expect(screen.getByRole('button', { name: 'Play online' })).toHaveClass('secondary')
    await userEvent.click(screen.getByRole('button', { name: 'Play online' }))
    expect(onOnline).toHaveBeenCalled()
  })
})
