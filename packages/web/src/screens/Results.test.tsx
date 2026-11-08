import { createGame, settingsFor } from '@ludo/engine'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Results } from './Results'

const finished = () => {
  const game = createGame(settingsFor('classic', 3, 'playForPlaces'))
  game.players[0].finishedPlace = 2
  game.players[1].finishedPlace = 1
  game.players[2].finishedPlace = 3
  return game
}

describe('Results', () => {
  it('has a Game over title', () => {
    render(<Results game={finished()} onPlayAgain={() => {}} onHome={() => {}} />)
    expect(screen.getByRole('heading', { level: 1, name: 'Game over' })).toBeInTheDocument()
  })

  it('lists players by place: colour, name, place', () => {
    render(<Results game={finished()} onPlayAgain={() => {}} onHome={() => {}} />)
    const rows = screen.getAllByRole('listitem')
    expect(rows.map((li) => li.textContent)).toEqual(['Green1st', 'Red2nd', 'Yellow3rd'])
    expect(rows[0].querySelector('.dot')).toHaveStyle({ background: '#30a46c' })
  })

  it('leaves the place blank for a player who did not finish', () => {
    const game = createGame(settingsFor('classic', 2, 'firstWins'))
    game.players[1].finishedPlace = 1
    render(<Results game={game} onPlayAgain={() => {}} onHome={() => {}} />)
    expect(screen.getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Yellow1st', 'Red'])
  })

  it('offers Play again as the main button, in the winner’s colour, and Home', async () => {
    const onPlayAgain = vi.fn()
    const onHome = vi.fn()
    render(<Results game={finished()} onPlayAgain={onPlayAgain} onHome={onHome} />)
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual(['Play again', 'Home'])
    expect(screen.getByRole('button', { name: 'Play again' })).toHaveClass('primary')
    expect(screen.getByRole('main').style.getPropertyValue('--player')).toBe('#30a46c')
    await userEvent.click(screen.getByRole('button', { name: 'Play again' }))
    await userEvent.click(screen.getByRole('button', { name: 'Home' }))
    expect(onPlayAgain).toHaveBeenCalled()
    expect(onHome).toHaveBeenCalled()
  })
})
