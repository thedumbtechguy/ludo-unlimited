import { MODES } from '@ludo/engine'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ComponentProps } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { Hand, ThemePref } from '../types'
import { Setup } from './Setup'

type Extra = { hand?: Hand; onHand?: (hand: Hand) => void; theme?: ThemePref; onTheme?: (theme: ThemePref) => void; onBack?: () => void }
const renderSetup = (props: Extra = {}) => {
  const onStart = vi.fn()
  render(
    <Setup
      onStart={onStart}
      onBack={props.onBack ?? (() => {})}
      hand={props.hand ?? 'right'}
      onHand={props.onHand ?? (() => {})}
      theme={props.theme ?? 'system'}
      onTheme={props.onTheme ?? (() => {})}
    />,
  )
  return onStart
}
const start = () => userEvent.click(screen.getByRole('button', { name: 'Start game' }))
const ghana = () => screen.getByRole('switch', { name: 'Ghana rules' })
/** Open a picker row and pick an option. */
async function pick(row: RegExp, option: string) {
  await userEvent.click(screen.getByRole('button', { name: row }))
  await userEvent.click(within(screen.getByRole('dialog')).getByRole('radio', { name: option }))
}

describe('Setup', () => {
  it('defaults to Ghana, 4 players, Red human and the rest computer', async () => {
    const onStart = renderSetup()
    await start()
    expect(onStart).toHaveBeenCalledWith(
      { players: 4, endCondition: 'firstWins', rules: MODES.ghana.rules, afterKick: 'normal' },
      { red: 'human', green: 'normal', yellow: 'normal', blue: 'normal' },
    )
  })

  it('builds the chosen settings', async () => {
    const onStart = renderSetup()
    await userEvent.click(ghana())
    await userEvent.click(screen.getByRole('button', { name: /Choose rules one by one/ }))
    await userEvent.click(screen.getByRole('switch', { name: 'Back Kick' }))
    await userEvent.keyboard('{Escape}')
    await pick(/After a kick/, 'Turn ends')
    await pick(/^Players/, '3 players')
    await userEvent.click(screen.getByRole('button', { name: /^Green player/ }))
    await pick(/Game ends/, 'When places are set')
    await start()
    expect(onStart).toHaveBeenCalledWith(
      {
        players: 3,
        endCondition: 'playForPlaces',
        rules: { ...MODES.classic.rules, backKick: true },
        afterKick: 'endsTurn',
      },
      { red: 'human', green: 'human', yellow: 'normal' },
    )
  })

  describe('Ghana rules switch', () => {
    it('is on for Ghana, off for Classic, and says what that means', async () => {
      const onStart = renderSetup()
      expect(ghana()).toHaveAttribute('aria-checked', 'true')
      expect(ghana()).toHaveAccessibleDescription('All kicks, Labourer')
      await userEvent.click(ghana())
      expect(ghana()).toHaveAttribute('aria-checked', 'false')
      expect(ghana()).toHaveAccessibleDescription('Plain Ludo')
      await start()
      expect(onStart.mock.calls[0][0]).toMatchObject({ rules: MODES.classic.rules, afterKick: 'normal' })
    })

    it('says Custom once a single rule is changed, and switching resets to the preset', async () => {
      const onStart = renderSetup()
      await userEvent.click(screen.getByRole('button', { name: /Choose rules one by one/ }))
      await userEvent.click(screen.getByRole('switch', { name: 'Labourer' }))
      expect(screen.getByRole('switch', { name: 'Labourer' })).toHaveAttribute('aria-checked', 'false')
      await userEvent.keyboard('{Escape}')
      expect(ghana()).toHaveAccessibleDescription('Custom')
      await start()
      expect(onStart.mock.calls[0][0].rules).toEqual({ ...MODES.ghana.rules, labourer: false })
      await userEvent.click(ghana())
      await userEvent.click(ghana())
      expect(ghana()).toHaveAccessibleDescription('All kicks, Labourer')
    })
  })

  describe('rules one by one', () => {
    it('is a labelled sheet with a switch per rule', async () => {
      renderSetup()
      await userEvent.click(screen.getByRole('button', { name: /Choose rules one by one/ }))
      const sheet = screen.getByRole('dialog', { name: 'Choose rules one by one' })
      expect(within(sheet).getAllByRole('switch').map((s) => [s.textContent, s.getAttribute('aria-checked')])).toEqual([
        ['Back Kick', 'true'],
        ['Line Kick', 'true'],
        ['Home Kick', 'true'],
        ['Labourer', 'true'],
      ])
    })
  })

  describe('pickers', () => {
    it('show the current option checked, and close when one is picked', async () => {
      renderSetup()
      expect(screen.getByRole('button', { name: /After a kick/ })).toHaveTextContent('Carry on')
      await userEvent.click(screen.getByRole('button', { name: /After a kick/ }))
      const picker = screen.getByRole('dialog', { name: 'After a kick' })
      const options = within(picker).getAllByRole('radio')
      expect(options.map((r) => r.getAttribute('aria-checked'))).toEqual(['true', 'false', 'false'])
      expect(options[0]).toHaveAccessibleName('Carry on')
      expect(options[1]).toHaveAccessibleName('Turn ends')
      expect(options[2]).toHaveAccessibleName('Bonus roll')
      // Each says what it does, under its name.
      expect(options[1]).toHaveAccessibleDescription('A kick ends your turn, even on a 6. Every roll is played straight away, one at a time.')
      await userEvent.click(within(picker).getByRole('radio', { name: 'Bonus roll' }))
      expect(screen.queryByRole('dialog')).toBeNull()
      expect(screen.getByRole('button', { name: /After a kick/ })).toHaveTextContent('Bonus roll')
    })

    it('close on Escape without changing anything', async () => {
      const onStart = renderSetup()
      await userEvent.click(screen.getByRole('button', { name: /Game ends/ }))
      expect(screen.getByRole('dialog', { name: 'Game ends' })).toBeInTheDocument()
      await userEvent.keyboard('{Escape}')
      expect(screen.queryByRole('dialog')).toBeNull()
      await start()
      expect(onStart.mock.calls[0][0].endCondition).toBe('firstWins')
    })

    it('Players sets the seats shown, in seat order', async () => {
      const onStart = renderSetup()
      await pick(/^Players/, '2 players')
      expect(screen.getAllByRole('button', { name: / player: / }).map((b) => b.getAttribute('aria-label'))).toEqual([
        'Red player: You',
        'Yellow player: Computer',
      ])
      await start()
      expect(onStart).toHaveBeenCalledWith(expect.objectContaining({ players: 2 }), { red: 'human', yellow: 'normal' })
    })
  })

  describe('seats', () => {
    it('switch between a person and the computer; the first person is You', async () => {
      const onStart = renderSetup()
      await userEvent.click(screen.getByRole('button', { name: 'Red player: You' }))
      await userEvent.click(screen.getByRole('button', { name: 'Green player: Computer' }))
      await userEvent.click(screen.getByRole('button', { name: 'Blue player: Computer' }))
      expect(screen.getByRole('button', { name: 'Red player: Computer' })).toHaveTextContent('Computer')
      expect(screen.getByRole('button', { name: 'Green player: You' })).toHaveTextContent('You')
      expect(screen.getByRole('button', { name: 'Blue player: Player 2' })).toHaveTextContent('Player 2')
      await start()
      expect(onStart.mock.calls[0][1]).toEqual({ red: 'normal', green: 'human', yellow: 'normal', blue: 'human' })
    })

    it('each computer has a level, normal unless picked; people have none', async () => {
      const onStart = renderSetup()
      expect(screen.queryByRole('button', { name: /^Red computer level/ })).toBeNull()
      await userEvent.click(screen.getByRole('button', { name: 'Green computer level: Normal' }))
      const sheet = screen.getByRole('dialog', { name: 'Green computer' })
      expect(sheet).toHaveTextContent('Plans its whole turn')
      await userEvent.click(screen.getByRole('radio', { name: 'Expert' }))
      expect(screen.queryByRole('dialog')).toBeNull()
      await userEvent.click(screen.getByRole('button', { name: 'Blue computer level: Normal' }))
      await userEvent.click(screen.getByRole('radio', { name: 'Easy' }))
      expect(screen.getByRole('button', { name: 'Green computer level: Expert' })).toHaveTextContent('Expert')
      await start()
      expect(onStart.mock.calls[0][1]).toEqual({ red: 'human', green: 'expert', yellow: 'normal', blue: 'easy' })
    })
  })

  describe('this device', () => {
    it('picks the playing hand', async () => {
      const onHand = vi.fn()
      renderSetup({ hand: 'right', onHand })
      expect(screen.getByRole('button', { name: /Playing hand/ })).toHaveTextContent('Right')
      await pick(/Playing hand/, 'Left')
      expect(onHand).toHaveBeenCalledWith('left')
    })

    it('picks the theme from System, Light and Dark', async () => {
      const onTheme = vi.fn()
      renderSetup({ theme: 'system', onTheme })
      expect(screen.getByRole('button', { name: /Theme/ })).toHaveTextContent('System')
      await userEvent.click(screen.getByRole('button', { name: /Theme/ }))
      const picker = screen.getByRole('radiogroup', { name: 'Theme' })
      expect(within(picker).getAllByRole('radio').map((r) => r.textContent)).toEqual(['System', 'Light', 'Dark'])
      expect(within(picker).getByRole('radio', { name: 'System' })).toHaveAttribute('aria-checked', 'true')
      await userEvent.click(within(picker).getByRole('radio', { name: 'Dark' }))
      expect(onTheme).toHaveBeenCalledWith('dark')
      expect(screen.queryByRole('dialog')).toBeNull()
    })

    it('lists the theme under This device, after the playing hand', () => {
      renderSetup({ theme: 'light' })
      const device = screen.getByRole('region', { name: 'This device' })
      expect(within(device).getAllByRole('button').map((b) => b.textContent)).toEqual(['Playing handRight', 'ThemeLight'])
    })
  })

  it('goes back', async () => {
    const onBack = vi.fn()
    renderSetup({ onBack })
    await userEvent.click(screen.getByRole('button', { name: 'Back' }))
    expect(onBack).toHaveBeenCalled()
  })

  it('has a "New game" title and a red Start game button', () => {
    renderSetup()
    expect(screen.getByRole('heading', { level: 1, name: 'New game' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Start game' })).toHaveClass('primary')
  })

  describe('online', () => {
    const renderOnline = (online: Partial<ComponentProps<typeof Setup>['online']> = {}) => {
      const onCreate = vi.fn()
      render(
        <Setup onBack={vi.fn()} hand="right" onHand={vi.fn()} theme="system" onTheme={vi.fn()} online={{ submitLabel: 'Create room', onCreate, ...online }} />,
      )
      return onCreate
    }

    it('has no seat rows, a turn timer and a computer level, and Create room hands them back', async () => {
      const onCreate = renderOnline()
      expect(screen.getByRole('heading', { level: 1, name: 'New room' })).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /Red player/ })).toBeNull()
      expect(screen.queryByText(/removed seats/)).toBeNull()
      expect(screen.getByRole('button', { name: /Turn timer/ })).toHaveTextContent('Normal')
      await userEvent.click(screen.getByRole('button', { name: /Turn timer/ }))
      const quick = screen.getByRole('radio', { name: 'Quick' })
      expect(quick).toHaveAccessibleDescription('15 seconds for each roll or move.')
      await userEvent.click(quick)
      expect(screen.getByRole('button', { name: /Computer level/ })).toHaveTextContent('Normal')
      await userEvent.click(screen.getByRole('button', { name: /Computer level/ }))
      await userEvent.click(screen.getByRole('radio', { name: 'Hard' }))
      await userEvent.click(screen.getByRole('button', { name: 'Create room' }))
      expect(onCreate).toHaveBeenCalledWith({ players: 4, endCondition: 'firstWins', rules: MODES.ghana.rules, afterKick: 'normal' }, 'quick', 'hard')
    })

    it('starts from a room\'s settings and saves them', async () => {
      const settings = { players: 2, endCondition: 'playForPlaces', rules: MODES.classic.rules, afterKick: 'bonusRoll' } as const
      const onCreate = renderOnline({ submitLabel: 'Save', initial: { settings, timer: 'off', level: 'easy' } })
      expect(ghana()).toHaveAttribute('aria-checked', 'false')
      expect(screen.getByRole('button', { name: /^Players/ })).toHaveTextContent('2')
      expect(screen.getByRole('button', { name: /Turn timer/ })).toHaveTextContent('No timer')
      expect(screen.getByRole('button', { name: /Computer level/ })).toHaveTextContent('Easy')
      expect(screen.getByText('People on removed seats go back to watching.')).toBeInTheDocument()
      await userEvent.click(screen.getByRole('button', { name: 'Save' }))
      expect(onCreate).toHaveBeenCalledWith(settings, 'off', 'easy')
    })
  })

  it('online: holds the button while the room is being made', () => {
    render(<Setup onBack={vi.fn()} hand="right" onHand={vi.fn()} theme="system" onTheme={vi.fn()} online={{ submitLabel: 'Create room', onCreate: vi.fn(), busy: true }} />)
    expect(screen.getByRole('button', { name: 'Creating…' })).toBeDisabled()
  })
})
