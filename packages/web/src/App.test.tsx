import { act, fireEvent, render, screen, within } from '@testing-library/react'
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
    expect(within(screen.getByRole('region', { name: 'Dice' })).getByText('Your turn')).toBeInTheDocument()
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
    // The first 6 only enters (entering and moving on is the same thing), so it plays itself.
    // The second 6 is a real choice: advance the entered piece, or enter another.
    await screen.findByText('Tap a numbered square, or a piece')
    expect(screen.getByRole('list', { name: 'Rolls this turn' }).children).toHaveLength(2)
    await user.click(screen.getByRole('button', { name: 'Menu' }))
    await user.click(screen.getByRole('button', { name: 'Quit to home' }))
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    expect(screen.getByText('Tap a numbered square, or a piece')).toBeInTheDocument()
    expect(screen.getByRole('list', { name: 'Rolls this turn' }).children).toHaveLength(2)
    expect(within(screen.getByRole('region', { name: 'Dice' })).getByText('Your turn')).toBeInTheDocument()
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

  it('keeps the playing hand picked on the setup screen', async () => {
    const user = userEvent.setup()
    render(<App dice={fixedDice([3])} timing={FAST_TIMING} />)
    await user.click(screen.getByRole('button', { name: 'New game' }))
    await user.click(screen.getByRole('button', { name: /Playing hand/ }))
    await user.click(screen.getByRole('radio', { name: 'Left' }))
    await user.click(screen.getByRole('button', { name: 'Start game' }))
    const red = screen.getAllByTestId('yard').find((el) => el.getAttribute('data-color') === 'red')!
    expect([red.getAttribute('x'), red.getAttribute('y')]).toEqual(['4', '364'])
    expect(localStorage.getItem('ludo-unlimited:hand')).toBe('left')
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
    expect(screen.getByRole('button', { name: 'Playing hand: Left' })).toBeInTheDocument()
    expect(red()).toHaveAttribute('x', '4')
    expect(red()).toHaveAttribute('y', '364')
    expect(screen.getByRole('region', { name: 'Dice' })).toHaveAttribute('data-hand', 'left')
    expect(localStorage.getItem('ludo-unlimited:hand')).toBe('left')
  })

  describe('theme', () => {
    afterEach(() => delete document.documentElement.dataset.theme)

    it('follows the system by default: light here', () => {
      render(<App dice={fixedDice([3])} timing={FAST_TIMING} />)
      expect(document.documentElement.dataset.theme).toBe('light')
    })

    it('starts in the stored theme', () => {
      localStorage.setItem('ludo-unlimited:theme', 'dark')
      render(<App dice={fixedDice([3])} timing={FAST_TIMING} />)
      expect(document.documentElement.dataset.theme).toBe('dark')
    })

    it('changes and remembers the theme from the setup screen', async () => {
      const user = userEvent.setup()
      render(<App dice={fixedDice([3])} timing={FAST_TIMING} />)
      await user.click(screen.getByRole('button', { name: 'New game' }))
      await user.click(screen.getByRole('button', { name: /Theme/ }))
      await user.click(screen.getByRole('radio', { name: 'Dark' }))
      expect(document.documentElement.dataset.theme).toBe('dark')
      expect(localStorage.getItem('ludo-unlimited:theme')).toBe('dark')
    })

    it('cycles and remembers the theme from the game menu', async () => {
      const user = userEvent.setup()
      render(<App dice={fixedDice([3])} timing={FAST_TIMING} />)
      await user.click(screen.getByRole('button', { name: 'New game' }))
      await user.click(screen.getByRole('button', { name: 'Start game' }))
      await user.click(screen.getByRole('button', { name: 'Menu' }))
      await user.click(screen.getByRole('button', { name: 'Theme: System' }))
      expect(localStorage.getItem('ludo-unlimited:theme')).toBe('light')
      await user.click(screen.getByRole('button', { name: 'Theme: Light' }))
      expect(document.documentElement.dataset.theme).toBe('dark')
      expect(screen.getByRole('button', { name: 'Theme: Dark' })).toBeInTheDocument()
    })
  })

  it('remembers the effects setting changed from the game menu', async () => {
    const user = userEvent.setup()
    render(<App dice={fixedDice([3])} timing={FAST_TIMING} />)
    await user.click(screen.getByRole('button', { name: 'New game' }))
    await user.click(screen.getByRole('button', { name: 'Start game' }))
    await user.click(screen.getByRole('button', { name: 'Menu' }))
    await user.click(screen.getByRole('button', { name: 'Effects: Full' }))
    expect(localStorage.getItem('ludo-unlimited:effects')).toBe('reduced')
    // Changing a setting leaves the menu open, showing the new value.
    expect(screen.getByRole('button', { name: 'Effects: Reduced' })).toBeInTheDocument()
  })

  it('remembers the sound and music settings changed from the game menu', async () => {
    const user = userEvent.setup()
    render(<App dice={fixedDice([3])} timing={FAST_TIMING} />)
    await user.click(screen.getByRole('button', { name: 'New game' }))
    await user.click(screen.getByRole('button', { name: 'Start game' }))
    await user.click(screen.getByRole('button', { name: 'Menu' }))
    await user.click(screen.getByRole('switch', { name: 'Sound' }))
    expect(localStorage.getItem('ludo-unlimited:sound')).toBe('off')
    await user.click(screen.getByRole('switch', { name: 'Music' }))
    expect(localStorage.getItem('ludo-unlimited:music')).toBe('off')
    expect(screen.getByRole('switch', { name: 'Sound' })).toHaveAttribute('aria-checked', 'false')
    expect(screen.getByRole('switch', { name: 'Music' })).toHaveAttribute('aria-checked', 'false')
    // Sound and music have their own switches: the effects level is untouched.
    expect(screen.getByRole('button', { name: 'Effects: Full' })).toBeInTheDocument()
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
    // The first 6 only enters (entering and moving on with the second 6 is the same), so it plays itself.
    // The second 6 can advance the entered piece, or enter another onto it.
    expect(await screen.findByRole('button', { name: 'Piece 1: Move on square 7' })).toBeInTheDocument()
    // Entering again would land on piece 1, so that square asks which one you mean.
    expect(screen.getByRole('button', { name: 'Piece 1 is on square 1, and piece 2 can move there: choose one' })).toBeInTheDocument()
    expect(screen.getByText('Tap a numbered square, or a piece')).toBeInTheDocument()
  })

  it('an all-computer game ends on the results screen', async () => {
    vi.useFakeTimers()
    render(<App dice={seededDice(5)} timing={FAST_TIMING} />)
    fireEvent.click(screen.getByRole('button', { name: 'New game' }))
    fireEvent.click(screen.getByRole('button', { name: 'Red player: You' }))
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
