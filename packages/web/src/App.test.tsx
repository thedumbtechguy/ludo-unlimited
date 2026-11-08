import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from './App'
import { fixedDice, seededDice } from './dice'
import { FAST_TIMING } from './useGame'

describe('App', () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => vi.useRealTimers())

  it('goes from home through setup into a game', async () => {
    const user = userEvent.setup()
    render(<App dice={fixedDice([3])} timing={FAST_TIMING} />)
    expect(screen.getByRole('heading', { name: 'Ludo Unlimited' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'New game' }))
    await user.click(screen.getByRole('button', { name: 'Start game' }))
    expect(screen.getByRole('button', { name: /Roll dice/ })).toBeEnabled()
    expect(screen.getByTestId('yard-label-red')).toHaveTextContent('YouYour turn')
  })

  it('offers Continue after quitting, and resumes the same game', async () => {
    const user = userEvent.setup()
    render(<App dice={fixedDice([6, 6, 3])} timing={FAST_TIMING} />)
    await user.click(screen.getByRole('button', { name: 'New game' }))
    await user.click(screen.getByRole('button', { name: 'Start game' }))
    await user.click(screen.getByRole('button', { name: /Roll dice/ }))
    await screen.findByRole('button', { name: 'Roll again' }) // a 6: roll again before moving
    await user.click(screen.getByRole('button', { name: /Roll dice/ }))
    await user.click(screen.getByRole('button', { name: /Roll dice/ })) // the 3 ends the rolling
    // The first 6 can enter, or enter and move on with the next rolls: a real choice.
    await screen.findByText('Tap a marked square')
    expect(screen.getByRole('list', { name: 'Rolls this turn' }).children).toHaveLength(3)
    await user.click(screen.getByRole('button', { name: 'Menu' }))
    await user.click(screen.getByRole('button', { name: 'Quit to home' }))
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    expect(screen.getByText('Tap a marked square')).toBeInTheDocument()
    expect(screen.getByRole('list', { name: 'Rolls this turn' }).children).toHaveLength(3)
    expect(screen.getByTestId('yard-label-red')).toHaveTextContent('YouYour turn')
  })

  it('restarts the game from the menu', async () => {
    const user = userEvent.setup()
    render(<App dice={fixedDice([6, 6, 3])} timing={FAST_TIMING} />)
    await user.click(screen.getByRole('button', { name: 'New game' }))
    await user.click(screen.getByRole('button', { name: 'Start game' }))
    await user.click(screen.getByRole('button', { name: /Roll dice/ }))
    expect(screen.getByRole('list', { name: 'Rolls this turn' }).children).toHaveLength(1)
    await user.click(screen.getByRole('button', { name: 'Menu' }))
    await user.click(screen.getByRole('button', { name: 'Restart game' }))
    expect(screen.getByRole('list', { name: 'Rolls this turn' }).children).toHaveLength(0)
    expect(screen.getByText('Tap the dice to roll')).toBeInTheDocument()
  })

  it('re-orients the board when the playing hand changes mid-game, and remembers it', async () => {
    const user = userEvent.setup()
    render(<App dice={fixedDice([3])} timing={FAST_TIMING} />)
    await user.click(screen.getByRole('button', { name: 'New game' }))
    await user.click(screen.getByRole('button', { name: 'Start game' }))
    const red = () => screen.getAllByTestId('yard').find((el) => el.getAttribute('data-color') === 'red')!
    expect(red()).toHaveAttribute('x', '364')
    await user.click(screen.getByRole('button', { name: 'Menu' }))
    await user.click(screen.getByRole('button', { name: 'Playing hand: Right' }))
    expect(red()).toHaveAttribute('x', '4')
    expect(red()).toHaveAttribute('y', '364')
    expect(localStorage.getItem('ludo-unlimited:hand')).toBe('left')
  })

  it('offers Stop after a human rolls a 6, and stopping shows the numbered moves', async () => {
    const user = userEvent.setup()
    render(<App dice={fixedDice([6])} timing={FAST_TIMING} />)
    await user.click(screen.getByRole('button', { name: 'New game' }))
    await user.click(screen.getByRole('button', { name: 'Start game' }))
    expect(screen.queryByRole('button', { name: 'Stop' })).toBeNull()
    await user.click(screen.getByRole('button', { name: /Roll dice/ }))
    expect(screen.getByRole('button', { name: 'Roll again' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Roll dice/ }))
    expect(screen.getByRole('list', { name: 'Rolls this turn' }).children).toHaveLength(2)
    await user.click(screen.getByRole('button', { name: 'Stop' }))
    expect(screen.queryByRole('button', { name: 'Stop' })).toBeNull()
    // The first 6 can enter, or enter and move on with the second 6 as one move.
    expect(screen.getByRole('button', { name: 'Move on square 7 using 6+6' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Move on square 1' }))
    // The second 6 can enter again or advance.
    expect(await screen.findByRole('button', { name: 'Piece 1: Move on square 7' })).toBeInTheDocument()
    // Entering again would land on piece 1, so that square is left to piece 1's own button.
    expect(screen.queryByRole('button', { name: 'Piece 2: Move on square 1' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Piece 1: Red, on square 1' })).toBeInTheDocument()
    expect(screen.getByText('Tap a numbered square, or a piece')).toBeInTheDocument()
  })

  it('an all-computer game ends on the results screen', async () => {
    vi.useFakeTimers()
    render(<App dice={seededDice(5)} timing={FAST_TIMING} />)
    fireEvent.click(screen.getByRole('button', { name: 'New game' }))
    fireEvent.change(screen.getByLabelText('Red player'), { target: { value: 'computer' } })
    fireEvent.click(screen.getByRole('button', { name: 'Start game' }))
    for (let i = 0; i < 50_000; i++) {
      await act(async () => {
        vi.runOnlyPendingTimers()
      })
      if (i % 200 === 0 && screen.queryByText('Game over')) break
    }
    expect(screen.getByRole('heading', { name: 'Game over' })).toBeInTheDocument()
  }, 60_000)
})
