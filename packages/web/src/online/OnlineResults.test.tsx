import { createGame, settingsFor } from '@ludo/engine'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { OnlineResults } from './OnlineResults'

const game = () => {
  const g = createGame(settingsFor('classic', 2, 'firstWins'))
  g.players[1].finishedPlace = 1
  g.players[0].finishedPlace = 2
  return g
}
const names = { red: 'Ama', yellow: 'Kofi' }

describe('OnlineResults', () => {
  it('lists the places by name; the host gets Rematch', async () => {
    const onRematch = vi.fn()
    render(<OnlineResults game={game()} names={names} host hostName="Ama" onRematch={onRematch} onLeave={vi.fn()} />)
    expect(screen.getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Kofi1st', 'Ama2nd'])
    await userEvent.click(screen.getByRole('button', { name: 'Rematch' }))
    expect(onRematch).toHaveBeenCalled()
  })

  it('everyone else waits for the host, and can leave', async () => {
    const onLeave = vi.fn()
    render(<OnlineResults game={game()} names={names} host={false} hostName="Ama" onRematch={vi.fn()} onLeave={onLeave} />)
    expect(screen.queryByRole('button', { name: 'Rematch' })).toBeNull()
    expect(screen.getByText('Waiting for Ama')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Leave' }))
    expect(onLeave).toHaveBeenCalled()
  })
})
