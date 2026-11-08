import { createGame, settingsFor, track } from '@ludo/engine'
import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
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
      effectsLevel="full"
      onEffectsLevel={noop}
      sound
      onSound={noop}
      music
      onMusic={noop}
      onFinish={noop}
      onQuit={noop}
      onRestart={noop}
      {...extra}
    />,
  )

describe('GameScreen', () => {
  afterEach(() => vi.useRealTimers())

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

    it('has no turn banner: whose turn it is shows above the dice', () => {
      renderGame()
      expect(document.querySelector('.banner')).toBeNull()
      expect(within(screen.getByRole('region', { name: 'Dice' })).getByText('Your turn')).toBeInTheDocument()
      expect(screen.getByTestId('yard-label-red')).toHaveTextContent('You0 home')
    })
  })

  describe('menu', () => {
    it('opens a sheet with Quit to home, Restart game and the playing hand', async () => {
      const onQuit = vi.fn()
      const onRestart = vi.fn()
      renderGame({}, { onQuit, onRestart })
      await userEvent.click(screen.getByRole('button', { name: 'Menu' }))
      const menu = screen.getByRole('dialog', { name: 'Menu' })
      expect(within(menu).getAllByRole('button').map((b) => b.textContent)).toEqual(['Quit to home', 'Restart game', 'Playing hand: Right', 'Effects: Full', 'Sound: On', 'Music: On'])
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
      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })

    it('switches the effects between full and reduced', async () => {
      const onEffectsLevel = vi.fn()
      const { unmount } = renderGame({}, { effectsLevel: 'full', onEffectsLevel })
      await userEvent.click(screen.getByRole('button', { name: 'Menu' }))
      await userEvent.click(screen.getByRole('button', { name: 'Effects: Full' }))
      expect(onEffectsLevel).toHaveBeenCalledWith('reduced')
      expect(screen.getByRole('dialog')).toBeInTheDocument()
      unmount()
      renderGame({}, { effectsLevel: 'reduced', onEffectsLevel })
      await userEvent.click(screen.getByRole('button', { name: 'Menu' }))
      await userEvent.click(screen.getByRole('button', { name: 'Effects: Reduced' }))
      expect(onEffectsLevel).toHaveBeenLastCalledWith('full')
    })

    it.each([
      ['Sound', 'sound', 'onSound'],
      ['Music', 'music', 'onMusic'],
    ] as const)('switches %s on and off', async (label, prop, handler) => {
      const onChange = vi.fn()
      const { unmount } = renderGame({}, { [prop]: true, [handler]: onChange })
      await userEvent.click(screen.getByRole('button', { name: 'Menu' }))
      await userEvent.click(screen.getByRole('button', { name: `${label}: On` }))
      expect(onChange).toHaveBeenCalledWith(false)
      expect(screen.getByRole('dialog')).toBeInTheDocument()
      unmount()
      renderGame({}, { [prop]: false, [handler]: onChange })
      await userEvent.click(screen.getByRole('button', { name: 'Menu' }))
      await userEvent.click(screen.getByRole('button', { name: `${label}: Off` }))
      expect(onChange).toHaveBeenLastCalledWith(true)
    })
  })

  describe('controls', () => {
    it('put the dice on the playing hand’s side', () => {
      const { unmount } = renderGame()
      expect(screen.getByRole('region', { name: 'Dice' })).toHaveAttribute('data-hand', 'right')
      unmount()
      renderGame({}, { hand: 'left' })
      expect(screen.getByRole('region', { name: 'Dice' })).toHaveAttribute('data-hand', 'left')
    })

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
      expect(screen.getByRole('status')).toHaveTextContent('No move with your 3')
      // Stacked: the note on its own line above the hint.
      expect(screen.getByText('No move with your 3', { selector: '.hint-note' })).toBeInTheDocument()
      expect(screen.getByText('Tap the dice to roll')).toBeInTheDocument()
    })

    it('stays quiet about a computer’s roll that had no move', async () => {
      vi.useFakeTimers()
      renderGame({ seats: { red: 'human', yellow: 'computer' } })
      await act(async () => {
        screen.getByRole('button', { name: /Roll dice/ }).click()
      })
      expect(screen.getByText('No move with your 3', { selector: '.hint-note' })).toBeInTheDocument()
      // Yellow (a computer) rolls a 3 with nothing on the board, and the turn comes back to Red.
      await act(async () => {
        vi.runOnlyPendingTimers()
      })
      expect(screen.queryByText(/had no move/)).toBeNull()
      expect(screen.queryByText('No move with your 3', { selector: '.hint-note' })).toBeNull()
    })
  })

  describe('whose turn', () => {
    it('names the current player above the dice', async () => {
      renderGame({ dice: fixedDice([3]) })
      const dice = screen.getByRole('region', { name: 'Dice' })
      expect(within(dice).getByText('Your turn')).toBeInTheDocument()
      await userEvent.click(screen.getByRole('button', { name: /Roll dice/ }))
      // Red's 3 had no move, so it is Yellow's turn now.
      expect(within(dice).getByText("Yellow's turn")).toBeInTheDocument()
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

    it('paints the players on their yards, and names whose turn it is above the dice', () => {
      renderGame(slowBot)
      expect(screen.getByTestId('yard-label-yellow')).toHaveTextContent('You0 home')
      expect(screen.getByTestId('yard-label-red')).toHaveTextContent('Computer0 home')
      expect(within(screen.getByRole('region', { name: 'Dice' })).getByText("Red's turn")).toBeInTheDocument()
    })

    it('a Labourer owner moves with the victim’s roll: the owner’s turn shows, the victim’s yard says Labourer', () => {
      const initial = { ...createGame(settings), turn: 'yellow' as const, labourers: { yellow: 'red' as const }, pendingRoll: 3 }
      initial.players[0].pieces = [track(5), track(20), initial.players[0].pieces[2], initial.players[0].pieces[3]]
      renderGame({ initial })
      expect(within(screen.getByRole('region', { name: 'Dice' })).getByText('Your turn')).toBeInTheDocument()
      expect(screen.getByTestId('active-yard')).toHaveAttribute('data-color', 'red')
      expect(screen.getByTestId('yard-label-yellow')).toHaveTextContent('Player 20 home')
      expect(screen.getByTestId('labourer-yellow')).toHaveTextContent('Labourer to Red')
    })
  })
})
