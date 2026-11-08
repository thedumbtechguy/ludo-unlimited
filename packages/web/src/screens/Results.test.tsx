import { createGame, settingsFor } from '@ludo/engine'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Results } from './Results'

describe('Results', () => {
  it('lists players by place', () => {
    const game = createGame(settingsFor('classic', 3, 'playForPlaces'))
    game.players[0].finishedPlace = 2
    game.players[1].finishedPlace = 1
    game.players[2].finishedPlace = 3
    render(<Results game={game} onPlayAgain={() => {}} onHome={() => {}} />)
    expect(screen.getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Green — 1st', 'Red — 2nd', 'Yellow — 3rd'])
  })
})
