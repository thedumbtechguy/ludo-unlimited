import { createGame, settingsFor, track } from '@ludo/engine'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { fixedDice } from '../dice'
import { FAST_TIMING } from '../useGame'
import { GameScreen } from './GameScreen'

const settings = settingsFor('classic', 2, 'firstWins')
const noop = () => {}
const humans = { red: 'human', yellow: 'human' } as const
const yard = (color: string) => screen.getAllByTestId('yard').find((el) => el.getAttribute('data-color') === color)!
const corner = (color: string) => [yard(color).getAttribute('x'), yard(color).getAttribute('y')]

type Extra = Partial<Parameters<typeof GameScreen>[0]>
const renderGame = (options: Partial<Parameters<typeof GameScreen>[0]['options']> = {}, extra: Extra = {}) =>
  render(
    <GameScreen
      options={{ settings, seats: humans, dice: fixedDice([3]), timing: FAST_TIMING, ...options }}
      hand="right"
      onHand={noop}
      onFinish={noop}
      onQuit={noop}
      onRestart={noop}
      {...extra}
    />,
  )

describe('GameScreen', () => {
  describe('top bar', () => {
    it('shows the title and the rules name', () => {
      renderGame()
      expect(screen.getByText('Ludo Unlimited')).toBeInTheDocument()
      expect(screen.getByText('Classic rules')).toBeInTheDocument()
    })

    it('names Ghana and custom rules', () => {
      const { unmount } = renderGame({ settings: settingsFor('ghana', 2, 'firstWins') })
      expect(screen.getByText('Ghana rules')).toBeInTheDocument()
      unmount()
      renderGame({ settings: { ...settings, rules: { ...settings.rules, backKick: true } } })
      expect(screen.getByText('Custom rules')).toBeInTheDocument()
    })

    it('has no turn banner: the yard tag says whose turn it is', () => {
      renderGame()
      expect(document.querySelector('.banner')).toBeNull()
      expect(screen.getByTestId('yard-label-red')).toHaveTextContent('YouYour turn')
    })
  })

  describe('menu', () => {
    it('opens a sheet with Quit to home, Restart game and the playing hand', async () => {
      const onQuit = vi.fn()
      const onRestart = vi.fn()
      renderGame({}, { onQuit, onRestart })
      await userEvent.click(screen.getByRole('button', { name: 'Menu' }))
      const menu = screen.getByRole('dialog', { name: 'Menu' })
      expect(within(menu).getAllByRole('button').map((b) => b.textContent)).toEqual(['Quit to home', 'Restart game', 'Playing hand: Right'])
      await userEvent.click(within(menu).getByRole('button', { name: 'Restart game' }))
      expect(onRestart).toHaveBeenCalledTimes(1)
      await userEvent.click(screen.getByRole('button', { name: 'Menu' }))
      await userEvent.click(screen.getByRole('button', { name: 'Quit to home' }))
      expect(onQuit).toHaveBeenCalledTimes(1)
    })

    it('closes on Escape', async () => {
      renderGame()
      await userEvent.click(screen.getByRole('button', { name: 'Menu' }))
      await userEvent.keyboard('{Escape}')
      expect(screen.queryByRole('dialog')).toBeNull()
    })

    it('switches the playing hand', async () => {
      const onHand = vi.fn()
      renderGame({}, { hand: 'left', onHand })
      await userEvent.click(screen.getByRole('button', { name: 'Menu' }))
      await userEvent.click(screen.getByRole('button', { name: 'Playing hand: Left' }))
      expect(onHand).toHaveBeenCalledWith('right')
      expect(screen.queryByRole('dialog')).toBeNull()
    })
  })

  describe('controls', () => {
    it('asks for a roll, then offers Roll again and Stop after a 6', async () => {
      renderGame({ dice: fixedDice([6, 6, 3]) })
      expect(screen.getByText('Tap the dice to roll')).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Stop' })).toBeNull()
      await userEvent.click(screen.getByRole('button', { name: /Roll dice/ }))
      expect(screen.queryByText('Tap the dice to roll')).toBeNull()
      await userEvent.click(screen.getByRole('button', { name: 'Roll again' }))
      expect(screen.getByRole('list', { name: 'Rolls this turn' }).children).toHaveLength(2)
      await userEvent.click(screen.getByRole('button', { name: 'Stop' }))
      expect(screen.queryByRole('button', { name: 'Roll again' })).toBeNull()
    })

    it('makes Roll again the main button, in the fixed button colour rather than a player’s', async () => {
      renderGame({ dice: fixedDice([6]) })
      await userEvent.click(screen.getByRole('button', { name: /Roll dice/ }))
      expect(screen.getByRole('button', { name: 'Roll again' })).toHaveClass('primary')
      expect(screen.getByRole('main').getAttribute('style')).toBeNull()
    })

    it('says when a roll has no moves', async () => {
      renderGame()
      await userEvent.click(screen.getByRole('button', { name: /Roll dice/ }))
      expect(screen.getByRole('status')).toHaveTextContent('No moves')
      expect(screen.getByText('No moves. Tap the dice to roll')).toBeInTheDocument()
    })
  })

  describe('kicks', () => {
    it('calls out a kick over the board', async () => {
      const initial = createGame(settingsFor('ghana', 2, 'firstWins'))
      initial.players[0].pieces[0] = track(10)
      initial.players[1].pieces[0] = track(7)
      renderGame({ settings: initial.settings, initial })
      await userEvent.click(screen.getByRole('button', { name: /Roll dice/ }))
      await userEvent.click(screen.getByRole('button', { name: 'Kick Yellow on square 8' }))
      expect(screen.getByText('Back kick!')).toBeInTheDocument()
      expect(screen.getByText('Red sent Yellow back to base')).toBeInTheDocument()
      expect(screen.getByRole('status')).toHaveTextContent('Red Back Kicked Yellow!')
    })
  })

  describe('board', () => {
    const seats = { red: 'computer', yellow: 'human' } as const
    const slowBot = { seats, timing: { ...FAST_TIMING, botRoll: 60_000 } }

    it('turns the first human’s yard bottom-right for a right hand', () => {
      renderGame(slowBot)
      expect(corner('yellow')).toEqual(['364', '364'])
    })

    it('turns the first human’s yard bottom-left for a left hand', () => {
      renderGame(slowBot, { hand: 'left' })
      expect(corner('yellow')).toEqual(['4', '364'])
    })

    it('turns red towards the viewer when nobody is human', () => {
      renderGame({ ...slowBot, seats: { red: 'computer', yellow: 'computer' } }, { hand: 'left' })
      expect(corner('red')).toEqual(['4', '364'])
    })

    it('paints the players on their yards and tags whose turn it is', () => {
      renderGame(slowBot)
      expect(screen.getByTestId('yard-label-yellow')).toHaveTextContent('You0 home')
      expect(screen.getByTestId('yard-label-red')).toHaveTextContent("ComputerRed's turn")
    })

    it('a Labourer owner moves with the victim’s roll: the owner is tagged, the victim’s yard says Labourer', () => {
      const initial = { ...createGame(settings), turn: 'yellow' as const, labourers: { yellow: 'red' as const }, pendingRoll: 3 }
      initial.players[0].pieces = [track(5), track(20), initial.players[0].pieces[2], initial.players[0].pieces[3]]
      renderGame({ initial })
      expect(screen.getByTestId('yard-label-red')).toHaveTextContent('YouYour turn')
      expect(screen.getByTestId('yard-label-yellow')).toHaveTextContent('Player 20 home')
      expect(screen.getByTestId('labourer-yellow')).toHaveTextContent('Labourer to Red')
    })
  })
})
