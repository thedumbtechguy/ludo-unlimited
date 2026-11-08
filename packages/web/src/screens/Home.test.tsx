import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Home } from './Home'

const renderHome = (canContinue: boolean, onNew = () => {}, onContinue = () => {}) =>
  render(<Home canContinue={canContinue} hand="right" onNew={onNew} onContinue={onContinue} />)

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
    // Only the two buttons: nothing on the board is interactive, and it is hidden from screen readers.
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual(['New game', 'Continue'])
    const board = document.querySelector('.home-board')!
    expect(board).toHaveAttribute('aria-hidden', 'true')
    expect(screen.getByRole('button', { name: 'Continue' }).compareDocumentPosition(board) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
})
