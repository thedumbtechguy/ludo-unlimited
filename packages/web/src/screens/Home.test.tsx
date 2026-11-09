import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Home } from './Home'

const calls = () => ({ onQuick: vi.fn(), onFind: vi.fn(), onFriends: vi.fn(), onNew: vi.fn(), onContinue: vi.fn() })
const renderHome = (canContinue: boolean, c = calls()) => {
  render(<Home canContinue={canContinue} hand="right" {...c} />)
  return c
}

describe('Home', () => {
  it('has the title and one line of description', () => {
    renderHome(false)
    expect(screen.getByRole('heading', { level: 1, name: 'Ludo Unlimited' })).toBeInTheDocument()
    expect(screen.getByText('Ludo with Ghanaian kicks.')).toBeInTheDocument()
  })

  it('leads with online play, then the game on this device', () => {
    renderHome(true)
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual(['Quick match', 'Find a game', 'Play with friends', 'Continue', 'New game'])
    expect(screen.getByRole('button', { name: 'Quick match' })).toHaveClass('primary')
    expect(screen.getByRole('heading', { name: 'On this device' })).toBeInTheDocument()
  })

  it('each button goes where it says', async () => {
    const c = renderHome(true)
    for (const [name, fn] of [['Quick match', c.onQuick], ['Find a game', c.onFind], ['Play with friends', c.onFriends], ['Continue', c.onContinue], ['New game', c.onNew]] as const) {
      await userEvent.click(screen.getByRole('button', { name }))
      expect(fn).toHaveBeenCalled()
    }
  })

  it('offers Continue only for a saved game', () => {
    const { unmount } = render(<Home canContinue={false} hand="right" {...calls()} />)
    expect(screen.queryByRole('button', { name: 'Continue' })).toBeNull()
    unmount()
    renderHome(true)
    expect(screen.getByRole('button', { name: 'Continue' })).toHaveClass('secondary')
  })

  it('shows the board under the buttons, static, in its starting position', () => {
    renderHome(true)
    expect(screen.getAllByTestId('piece')).toHaveLength(16)
    const board = document.querySelector('.home-board')!
    expect(board).toHaveAttribute('aria-hidden', 'true')
    expect(screen.getByRole('button', { name: 'New game' }).compareDocumentPosition(board) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
})
