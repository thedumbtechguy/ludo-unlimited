import { MODES, type RoomView } from '@ludo/engine'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from './App'
import { fixedDice, seededDice } from './dice'
import { createRoom } from './online/api'
import { useOnlineGame } from './online/useOnlineGame'
import { setPlaying } from './update'
import { FAST_TIMING } from './useGame'

vi.mock('./online/useOnlineGame', () => ({ useOnlineGame: vi.fn() }))
vi.mock('./online/api', async (original) => ({ ...(await original<typeof import('./online/api')>()), createRoom: vi.fn() }))
vi.mock('./update', async (original) => ({ ...(await original<typeof import('./update')>()), setPlaying: vi.fn() }))

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

describe('App online', () => {
  const lobby = (code: string): RoomView => ({
    code,
    phase: 'lobby',
    host: 1,
    settings: { players: 4, endCondition: 'firstWins', rules: MODES.ghana.rules, afterKick: 'normal' },
    timer: 'normal',
    members: [{ id: 1, name: 'Ama', connected: true }],
    computers: [],
    covering: [],
    paused: false,
    log: [],
    seq: 0,
  })
  const renderApp = () => render(<App dice={fixedDice([3])} timing={FAST_TIMING} />)

  beforeEach(() => {
    localStorage.clear()
    history.replaceState(null, '', '/')
    vi.mocked(useOnlineGame).mockImplementation(
      ({ code }) => ({ room: lobby(code), you: { id: 1, host: true }, send: vi.fn() }) as unknown as ReturnType<typeof useOnlineGame>,
    )
  })

  it('joins a room by its code, and leaving goes home', async () => {
    const user = userEvent.setup()
    renderApp()
    await user.click(screen.getByRole('button', { name: 'Play online' }))
    await user.type(screen.getByRole('textbox', { name: 'Your name' }), 'Ama')
    await user.type(screen.getByRole('textbox', { name: 'Room code' }), 'kqmz')
    await user.click(screen.getByRole('button', { name: 'Join' }))
    expect(screen.getByText('KQMZ')).toBeInTheDocument()
    expect(useOnlineGame).toHaveBeenLastCalledWith(expect.objectContaining({ code: 'KQMZ', name: 'Ama' }))
    expect(localStorage.getItem('ludo-unlimited:name')).toBe('Ama')
    expect(location.pathname).toBe('/r/KQMZ')
    // A room counts as a game: app updates wait for it.
    expect(setPlaying).toHaveBeenLastCalledWith(true)
    await user.click(screen.getByRole('button', { name: 'Leave room' }))
    expect(screen.getByRole('heading', { name: 'Ludo Unlimited' })).toBeInTheDocument()
    expect(location.pathname).toBe('/')
    expect(setPlaying).toHaveBeenLastCalledWith(false)
  })

  it('creates a room and opens it', async () => {
    vi.mocked(createRoom).mockResolvedValue('WXYZ')
    const user = userEvent.setup()
    renderApp()
    await user.click(screen.getByRole('button', { name: 'Play online' }))
    await user.type(screen.getByRole('textbox', { name: 'Your name' }), 'Ama')
    await user.click(screen.getByRole('button', { name: 'Create a room' }))
    expect(screen.getByRole('heading', { level: 1, name: 'New room' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Create room' }))
    expect(createRoom).toHaveBeenCalledWith(expect.objectContaining({ name: 'Ama', timer: 'normal', settings: expect.objectContaining({ players: 4 }) }))
    expect(await screen.findByText('WXYZ')).toBeInTheDocument()
  })

  it('says so when too many rooms were made', async () => {
    vi.mocked(createRoom).mockRejectedValue(new Error('too_fast'))
    const user = userEvent.setup()
    localStorage.setItem('ludo-unlimited:name', 'Ama')
    renderApp()
    await user.click(screen.getByRole('button', { name: 'Play online' }))
    await user.click(screen.getByRole('button', { name: 'Create a room' }))
    await user.click(screen.getByRole('button', { name: 'Create room' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Too many new rooms. Try again in a minute.')
  })

  it('opens a room link straight away when there is a name', () => {
    localStorage.setItem('ludo-unlimited:name', 'Ama')
    history.replaceState(null, '', '/r/abcd')
    renderApp()
    expect(screen.getByText('ABCD')).toBeInTheDocument()
    expect(location.pathname).toBe('/r/ABCD')
  })

  it('asks for a name first on a room link, with the code filled in', () => {
    history.replaceState(null, '', '/r/ABCD')
    renderApp()
    expect(screen.getByRole('heading', { name: 'Play online' })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Room code' })).toHaveValue('ABCD')
  })
})
