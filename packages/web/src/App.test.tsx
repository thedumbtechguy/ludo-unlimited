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
    expect(screen.getByText('Red to roll')).toBeInTheDocument()
  })

  it('offers Continue after quitting, and resumes the same game', async () => {
    const user = userEvent.setup()
    render(<App dice={fixedDice([6, 6, 3])} timing={FAST_TIMING} />)
    await user.click(screen.getByRole('button', { name: 'New game' }))
    await user.click(screen.getByRole('button', { name: 'Start game' }))
    await user.click(screen.getByRole('button', { name: /Roll dice/ }))
    await screen.findByText('Red to roll') // a 6: roll again before moving
    await user.click(screen.getByRole('button', { name: /Roll dice/ }))
    await user.click(screen.getByRole('button', { name: /Roll dice/ })) // the 3 ends the rolling
    // The first 6's lone enter move auto-plays; the second 6 can enter or advance: a real choice.
    await screen.findByText('Red to move')
    await user.click(screen.getByRole('button', { name: 'Quit to menu' }))
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    expect(screen.getByText('Red to move')).toBeInTheDocument()
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
