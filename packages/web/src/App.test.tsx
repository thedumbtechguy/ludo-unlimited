import { createGame, MODES, type RoomView } from '@ludo/engine'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from './App'
import { fixedDice, seededDice } from './dice'
import { createRoom, openRooms, quickMatch } from './online/api'
import { useOnlineGame } from './online/useOnlineGame'
import { setPlaying } from './update'
import { FAST_TIMING } from './useGame'

vi.mock('./online/useOnlineGame', () => ({ useOnlineGame: vi.fn() }))
vi.mock('./online/api', async (original) => ({ ...(await original<typeof import('./online/api')>()), createRoom: vi.fn(), quickMatch: vi.fn(), openRooms: vi.fn() }))
vi.mock('./update', async (original) => ({ ...(await original<typeof import('./update')>()), setPlaying: vi.fn() }))

// The back gesture: the browser steps back an entry and says so a moment later.
const pressBack = () => act(async () => history.back())
const heading = (name: string) => screen.findByRole('heading', { level: 1, name })

describe('App', () => {
  beforeEach(() => {
    localStorage.clear()
    history.replaceState(null, '', '/')
  })
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

  describe('back', () => {
    it('goes from a new game back home', async () => {
      const user = userEvent.setup()
      render(<App dice={fixedDice([3])} timing={FAST_TIMING} />)
      await user.click(screen.getByRole('button', { name: 'New game' }))
      await pressBack()
      expect(await heading('Ludo Unlimited')).toBeInTheDocument()
    })

    it('goes from a game home, where it can be continued', async () => {
      const user = userEvent.setup()
      render(<App dice={fixedDice([3])} timing={FAST_TIMING} />)
      await user.click(screen.getByRole('button', { name: 'New game' }))
      await user.click(screen.getByRole('button', { name: 'Start game' }))
      await user.click(screen.getByRole('button', { name: /Roll dice/ }))
      await pressBack()
      expect(await screen.findByRole('button', { name: 'Continue' })).toBeInTheDocument()
      // Home is the first entry again: the setup screen isn't left behind it.
      await waitFor(() => expect(history.state).toMatchObject({ depth: 0 }))
    })

    it('closes an open sheet and stays on the screen, then goes back', async () => {
      const user = userEvent.setup()
      render(<App dice={fixedDice([3])} timing={FAST_TIMING} />)
      await user.click(screen.getByRole('button', { name: 'New game' }))
      await user.click(screen.getByRole('button', { name: 'Start game' }))
      await user.click(screen.getByRole('button', { name: 'Menu' }))
      expect(screen.getByRole('dialog')).toBeInTheDocument()
      await pressBack()
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
      expect(screen.getByRole('button', { name: /Roll dice/ })).toBeInTheDocument()
      await pressBack()
      expect(await screen.findByRole('button', { name: 'Continue' })).toBeInTheDocument()
    })

    it('after a sheet closes on its own, goes back to the screen before', async () => {
      const user = userEvent.setup()
      render(<App dice={fixedDice([3])} timing={FAST_TIMING} />)
      await user.click(screen.getByRole('button', { name: 'New game' }))
      await user.click(screen.getByRole('button', { name: /Theme/ }))
      await user.click(screen.getByRole('radio', { name: 'Dark' }))
      expect(screen.queryByRole('dialog')).toBeNull()
      await pressBack()
      expect(await heading('Ludo Unlimited')).toBeInTheDocument()
    })

    it('a picker opened straight after another still closes on back', async () => {
      const user = userEvent.setup()
      render(<App dice={fixedDice([3])} timing={FAST_TIMING} />)
      await user.click(screen.getByRole('button', { name: 'New game' }))
      await user.click(screen.getByRole('button', { name: /Theme/ }))
      await user.click(screen.getByRole('radio', { name: 'Dark' }))
      await user.click(screen.getByRole('button', { name: /Playing hand/ }))
      await pressBack()
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
      expect(screen.getByRole('heading', { level: 1, name: 'New game' })).toBeInTheDocument()
      await pressBack()
      expect(await heading('Ludo Unlimited')).toBeInTheDocument()
    })
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
    level: 'normal',
    members: [{ id: 1, name: 'Ama', connected: true }],
    computers: [],
    covering: [],
    paused: false,
    game: createGame({ players: 4, endCondition: 'firstWins', rules: MODES.ghana.rules, afterKick: 'normal' }),
    seq: 0,
  })
  const renderApp = () => render(<App dice={fixedDice([3])} timing={FAST_TIMING} />)

  beforeEach(() => {
    localStorage.clear()
    history.replaceState(null, '', '/')
    vi.mocked(quickMatch).mockReset()
    vi.mocked(useOnlineGame).mockImplementation(
      ({ code }) => ({ room: lobby(code), you: { id: 1, host: true }, status: 'open', clock: { paused: false, covering: [] }, send: vi.fn() }) as unknown as ReturnType<typeof useOnlineGame>,
    )
  })

  it('joins a room by its code, and leaving goes home', async () => {
    const user = userEvent.setup()
    renderApp()
    await user.click(screen.getByRole('button', { name: 'Play with friends' }))
    await user.type(screen.getByRole('textbox', { name: 'Your name' }), 'Ama')
    await user.click(screen.getByRole('button', { name: 'Next' }))
    await user.click(screen.getByRole('button', { name: 'Join a room' }))
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
    await waitFor(() => expect(location.pathname).toBe('/'))
    expect(setPlaying).toHaveBeenLastCalledWith(false)
  })

  it('asks for a name before going online, then goes where you were going', async () => {
    const user = userEvent.setup()
    renderApp()
    await user.click(screen.getByRole('button', { name: 'Play with friends' }))
    await user.type(screen.getByRole('textbox', { name: 'Your name' }), 'Ama')
    await user.click(screen.getByRole('button', { name: 'Next' }))
    expect(screen.getByRole('heading', { name: 'Play with friends' })).toBeInTheDocument()
  })

  it('Quick match and Find a game also ask for a name first', async () => {
    const user = userEvent.setup()
    renderApp()
    await user.click(screen.getByRole('button', { name: 'Quick match' }))
    await user.type(screen.getByRole('textbox', { name: 'Your name' }), 'Ama')
    await user.click(screen.getByRole('button', { name: 'Next' }))
    expect(screen.getByRole('heading', { level: 1, name: 'Quick match' })).toBeInTheDocument()
  })

  it('Find a game lists the open rooms, and tapping one opens it', async () => {
    vi.mocked(openRooms).mockResolvedValue([
      { code: 'QWRT', kind: 'quick', mode: 'classic', phase: 'playing', players: 4, humans: 2, seatsFree: 0, computerSeats: ['blue'], timer: 'normal' },
    ])
    localStorage.setItem('ludo-unlimited:name', 'Ama')
    const user = userEvent.setup()
    renderApp()
    await user.click(screen.getByRole('button', { name: 'Find a game' }))
    await user.click(await screen.findByTestId('listing'))
    await waitFor(() => expect(location.pathname).toBe('/r/QWRT'))
    expect(useOnlineGame).toHaveBeenLastCalledWith(expect.objectContaining({ code: 'QWRT', name: 'Ama' }))
  })

  it('quick match finds a room and opens it, remembering the rules', async () => {
    vi.mocked(quickMatch).mockResolvedValue('QWRT')
    localStorage.setItem('ludo-unlimited:name', 'Ama')
    const user = userEvent.setup()
    renderApp()
    await user.click(screen.getByRole('button', { name: 'Quick match' }))
    await user.click(screen.getByRole('button', { name: /^Rules/ }))
    await user.click(screen.getByRole('radio', { name: 'Classic' }))
    await user.click(screen.getByRole('button', { name: 'Go' }))
    await waitFor(() => expect(location.pathname).toBe('/r/QWRT'))
    expect(quickMatch).toHaveBeenCalledWith({ device: expect.any(String), name: 'Ama', mode: 'classic', skip: undefined })
    expect(localStorage.getItem('ludo-unlimited:quick-mode')).toBe('classic')
  })

  it('ignores a quick match answer that comes after Cancel', async () => {
    let found!: (code: string) => void
    vi.mocked(quickMatch).mockReturnValueOnce(new Promise((resolve) => (found = resolve)))
    localStorage.setItem('ludo-unlimited:name', 'Ama')
    const user = userEvent.setup()
    renderApp()
    await user.click(screen.getByRole('button', { name: 'Quick match' }))
    await user.click(screen.getByRole('button', { name: 'Go' }))
    expect(screen.getByRole('status')).toHaveTextContent('Finding a game…')
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    await act(async () => found('LATE'))
    expect(screen.getByRole('button', { name: 'Go' })).toBeInTheDocument()
    expect(location.pathname).toBe('/')
  })

  it('says so when quick match is over the limit, and Try again goes again', async () => {
    vi.mocked(quickMatch).mockRejectedValueOnce(new Error('too_fast')).mockRejectedValueOnce(new Error('failed'))
    localStorage.setItem('ludo-unlimited:name', 'Ama')
    const user = userEvent.setup()
    renderApp()
    await user.click(screen.getByRole('button', { name: 'Quick match' }))
    await user.click(screen.getByRole('button', { name: 'Go' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Too many new games. Try again in a minute.')
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Couldn’t find a game. Check your connection and try again.'))
  })

  it('a quick room with no seat for you is tried once more, skipping it', async () => {
    vi.mocked(quickMatch).mockResolvedValueOnce('FULL').mockResolvedValueOnce('NEXT')
    vi.mocked(useOnlineGame).mockImplementation(
      ({ code }) =>
        ({
          room: { ...lobby(code), open: 'quick' },
          you: code === 'FULL' ? { id: 9, host: false } : { id: 9, seat: 'green', host: false },
          status: 'open',
          send: vi.fn(),
          clock: { paused: false, covering: [] },
        }) as unknown as ReturnType<typeof useOnlineGame>,
    )
    localStorage.setItem('ludo-unlimited:name', 'Ama')
    const user = userEvent.setup()
    renderApp()
    await user.click(screen.getByRole('button', { name: 'Quick match' }))
    await user.click(screen.getByRole('button', { name: 'Go' }))
    await waitFor(() => expect(location.pathname).toBe('/r/NEXT'))
    expect(quickMatch).toHaveBeenLastCalledWith(expect.objectContaining({ skip: 'FULL' }))
  })

  it('a second quick room with no seat says so, with Try again', async () => {
    vi.mocked(quickMatch).mockResolvedValueOnce('FULL').mockResolvedValueOnce('GONE')
    vi.mocked(useOnlineGame).mockImplementation(
      ({ code }) =>
        ({ room: { ...lobby(code), open: 'quick' }, you: { id: 9, host: false }, status: 'open', send: vi.fn(), clock: { paused: false, covering: [] } }) as unknown as ReturnType<
          typeof useOnlineGame
        >,
    )
    localStorage.setItem('ludo-unlimited:name', 'Ama')
    const user = userEvent.setup()
    renderApp()
    await user.click(screen.getByRole('button', { name: 'Quick match' }))
    await user.click(screen.getByRole('button', { name: 'Go' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Couldn’t find a seat. Try again.')
    expect(quickMatch).toHaveBeenCalledTimes(2)
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
  })

  it('creates a room and opens it', async () => {
    vi.mocked(createRoom).mockResolvedValue('WXYZ')
    const user = userEvent.setup()
    renderApp()
    await user.click(screen.getByRole('button', { name: 'Play with friends' }))
    await user.type(screen.getByRole('textbox', { name: 'Your name' }), 'Ama')
    await user.click(screen.getByRole('button', { name: 'Next' }))
    await user.click(screen.getByRole('button', { name: 'Create a room' }))
    expect(screen.getByRole('heading', { level: 1, name: 'New room' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Create room' }))
    expect(createRoom).toHaveBeenCalledWith(expect.objectContaining({ name: 'Ama', timer: 'normal', open: false, settings: expect.objectContaining({ players: 4 }) }))
    expect(await screen.findByText('WXYZ')).toBeInTheDocument()
  })

  it('says so when too many rooms were made', async () => {
    vi.mocked(createRoom).mockRejectedValue(new Error('too_fast'))
    const user = userEvent.setup()
    localStorage.setItem('ludo-unlimited:name', 'Ama')
    renderApp()
    await user.click(screen.getByRole('button', { name: 'Play with friends' }))
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

  it('asks for a name first on a room link, then opens that room', async () => {
    const user = userEvent.setup()
    history.replaceState(null, '', '/r/ABCD')
    renderApp()
    expect(screen.getByRole('heading', { name: 'Play online' })).toBeInTheDocument()
    // A refresh here keeps the code.
    expect(location.pathname).toBe('/r/ABCD')
    await user.type(screen.getByRole('textbox', { name: 'Your name' }), 'Kofi')
    await user.click(screen.getByRole('button', { name: 'Next' }))
    expect(screen.getByText('ABCD')).toBeInTheDocument()
    expect(useOnlineGame).toHaveBeenLastCalledWith(expect.objectContaining({ code: 'ABCD', name: 'Kofi' }))
  })

  it('starts on the choice with a saved name, and Change goes back to the name', async () => {
    const user = userEvent.setup()
    localStorage.setItem('ludo-unlimited:name', 'Ama')
    renderApp()
    await user.click(screen.getByRole('button', { name: 'Play with friends' }))
    expect(screen.getByText(/Playing as Ama/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Change' }))
    expect(screen.getByRole('textbox', { name: 'Your name' })).toHaveValue('Ama')
  })

  it('holds Create room while the room is made', async () => {
    let made!: (code: string) => void
    vi.mocked(createRoom).mockReturnValue(new Promise((resolve) => (made = resolve)))
    const user = userEvent.setup()
    localStorage.setItem('ludo-unlimited:name', 'Ama')
    renderApp()
    await user.click(screen.getByRole('button', { name: 'Play with friends' }))
    await user.click(screen.getByRole('button', { name: 'Create a room' }))
    await user.click(screen.getByRole('button', { name: 'Create room' }))
    expect(screen.getByRole('button', { name: 'Creating…' })).toBeDisabled()
    await act(async () => made('WXYZ'))
    expect(screen.getByText('WXYZ')).toBeInTheDocument()
  })

  it('stays out of a room you backed out of making', async () => {
    let made!: (code: string) => void
    vi.mocked(createRoom).mockReturnValueOnce(new Promise((resolve) => (made = resolve)))
    const user = userEvent.setup()
    localStorage.setItem('ludo-unlimited:name', 'Ama')
    renderApp()
    await user.click(screen.getByRole('button', { name: 'Play with friends' }))
    await user.click(screen.getByRole('button', { name: 'Create a room' }))
    await user.click(screen.getByRole('button', { name: 'Create room' }))
    await user.click(screen.getByRole('button', { name: 'Back' }))
    // Back on Create room before the first answer: that answer is still not yours to act on.
    await user.click(screen.getByRole('button', { name: 'Create a room' }))
    await act(async () => made('WXYZ'))
    expect(screen.getByRole('heading', { level: 1, name: 'New room' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Create room' })).toBeEnabled()
    expect(location.pathname).toBe('/')
  })

  describe('back', () => {
    const toChoice = async (user: ReturnType<typeof userEvent.setup>) => {
      await user.click(screen.getByRole('button', { name: 'Play with friends' }))
      await user.type(screen.getByRole('textbox', { name: 'Your name' }), 'Ama')
      await user.click(screen.getByRole('button', { name: 'Next' }))
    }

    it('steps back from making a room to the choice, the name, then home', async () => {
      const user = userEvent.setup()
      renderApp()
      await toChoice(user)
      await user.click(screen.getByRole('button', { name: 'Create a room' }))
      expect(screen.getByRole('heading', { level: 1, name: 'New room' })).toBeInTheDocument()
      await pressBack()
      expect(await screen.findByText(/Playing as Ama/)).toBeInTheDocument()
      await pressBack()
      expect(await screen.findByRole('textbox', { name: 'Your name' })).toHaveValue('Ama')
      await pressBack()
      expect(await heading('Ludo Unlimited')).toBeInTheDocument()
    })

    it('the on-screen Back does the same', async () => {
      const user = userEvent.setup()
      renderApp()
      await toChoice(user)
      await user.click(screen.getByRole('button', { name: 'Join a room' }))
      await user.click(screen.getByRole('button', { name: 'Back' }))
      expect(await screen.findByText(/Playing as Ama/)).toBeInTheDocument()
      await pressBack()
      expect(await screen.findByRole('textbox', { name: 'Your name' })).toBeInTheDocument()
    })

    it('goes from the room code back to the choice', async () => {
      const user = userEvent.setup()
      localStorage.setItem('ludo-unlimited:name', 'Ama')
      renderApp()
      await user.click(screen.getByRole('button', { name: 'Play with friends' }))
      await user.click(screen.getByRole('button', { name: 'Join a room' }))
      await pressBack()
      expect(await screen.findByText(/Playing as Ama/)).toBeInTheDocument()
      await pressBack()
      expect(await heading('Ludo Unlimited')).toBeInTheDocument()
    })

    it('leaves a room for home', async () => {
      const user = userEvent.setup()
      renderApp()
      await toChoice(user)
      await user.click(screen.getByRole('button', { name: 'Join a room' }))
      await user.type(screen.getByRole('textbox', { name: 'Room code' }), 'kqmz')
      await user.click(screen.getByRole('button', { name: 'Join' }))
      await waitFor(() => expect(location.pathname).toBe('/r/KQMZ'))
      await pressBack()
      expect(await heading('Ludo Unlimited')).toBeInTheDocument()
      await waitFor(() => expect(location.pathname).toBe('/'))
      await waitFor(() => expect(history.state).toMatchObject({ depth: 0 }))
      expect(setPlaying).toHaveBeenLastCalledWith(false)
    })

    it('leaves a room opened by a link, after the name, for home', async () => {
      const user = userEvent.setup()
      history.replaceState(null, '', '/r/ABCD')
      renderApp()
      await user.type(screen.getByRole('textbox', { name: 'Your name' }), 'Kofi')
      await user.click(screen.getByRole('button', { name: 'Next' }))
      expect(screen.getByText('ABCD')).toBeInTheDocument()
      await pressBack()
      expect(await heading('Ludo Unlimited')).toBeInTheDocument()
      await waitFor(() => expect(location.pathname).toBe('/'))
    })
  })
})
