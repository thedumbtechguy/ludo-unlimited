import { MODES } from '@ludo/engine'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Setup } from './Setup'

describe('Setup', () => {
  it('defaults to Ghana, 4 players, Red human and the rest computer', async () => {
    const onStart = vi.fn()
    render(<Setup onStart={onStart} onBack={() => {}} />)
    await userEvent.click(screen.getByRole('button', { name: 'Start game' }))
    expect(onStart).toHaveBeenCalledWith(
      { players: 4, endCondition: 'firstWins', rules: MODES.ghana.rules, afterKick: 'normal' },
      { red: 'human', green: 'computer', yellow: 'computer', blue: 'computer' },
    )
  })

  it('builds the chosen settings', async () => {
    const user = userEvent.setup()
    const onStart = vi.fn()
    render(<Setup onStart={onStart} onBack={() => {}} />)
    await user.click(screen.getByLabelText('Classic'))
    await user.click(screen.getByText('Customise rules'))
    await user.click(screen.getByLabelText('Back Kick'))
    await user.selectOptions(screen.getByLabelText('After a kick'), 'endsTurn')
    await user.click(screen.getByLabelText('3 players'))
    await user.selectOptions(screen.getByLabelText('Green player'), 'human')
    await user.click(screen.getByLabelText('Play on for places'))
    await user.click(screen.getByRole('button', { name: 'Start game' }))
    expect(onStart).toHaveBeenCalledWith(
      {
        players: 3,
        endCondition: 'playForPlaces',
        rules: { ...MODES.classic.rules, backKick: true },
        afterKick: 'endsTurn',
      },
      { red: 'human', green: 'human', yellow: 'computer' },
    )
  })
})
