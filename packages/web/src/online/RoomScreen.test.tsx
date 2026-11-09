import { createGame, MODES, type ErrorCode, type RoomView, type YouView } from '@ludo/engine'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { updateNow } from '../update'
import { FAST_TIMING } from '../useGame'
import { OnlineGame } from './OnlineGame'
import { RoomScreen } from './RoomScreen'
import { useOnlineGame } from './useOnlineGame'

vi.mock('./useOnlineGame', () => ({ useOnlineGame: vi.fn() }))
vi.mock('../update', () => ({ updateNow: vi.fn() }))
vi.mock('./OnlineGame', () => ({ OnlineGame: vi.fn(() => <p>Game in progress</p>) }))

const ROOM: RoomView = {
  code: 'KQMZ',
  phase: 'lobby',
  host: 1,
  settings: { players: 4, endCondition: 'firstWins', rules: MODES.ghana.rules, afterKick: 'normal' },
  timer: 'normal',
  members: [{ id: 1, name: 'Ama', connected: true, seat: 'red' }],
  computers: [],
  covering: [],
  paused: false,
  game: createGame({ players: 4, endCondition: 'firstWins', rules: MODES.ghana.rules, afterKick: 'normal' }),
  seq: 0,
}
const HOST: YouView = { id: 1, seat: 'red', host: true }
const send = vi.fn()

function given(state: { room?: RoomView; you?: YouView; error?: ErrorCode; status?: string }) {
  vi.mocked(useOnlineGame).mockReturnValue({ status: 'open', clock: { paused: false, covering: [] }, ...state, send } as unknown as ReturnType<typeof useOnlineGame>)
}
const prefs = {
  hand: 'right',
  onHand: vi.fn(),
  theme: 'system',
  onTheme: vi.fn(),
  effectsLevel: 'full',
  onEffectsLevel: vi.fn(),
  sound: true,
  onSound: vi.fn(),
  music: true,
  onMusic: vi.fn(),
} as const
function renderRoom(onNoSeat?: () => void) {
  const onLeave = vi.fn()
  render(<RoomScreen code="KQMZ" device="d1" name="Ama" timing={FAST_TIMING} onLeave={onLeave} onNoSeat={onNoSeat} prefs={prefs} />)
  return onLeave
}

describe('RoomScreen', () => {
  beforeEach(() => vi.clearAllMocks())

  it('says it is connecting until the room arrives, with a way home', async () => {
    given({ status: 'connecting' })
    const onLeave = renderRoom()
    expect(screen.getByRole('status')).toHaveTextContent('Connecting…')
    expect(useOnlineGame).toHaveBeenCalledWith({ code: 'KQMZ', device: 'd1', name: 'Ama', timing: FAST_TIMING })
    await userEvent.click(screen.getByRole('button', { name: 'Home' }))
    expect(onLeave).toHaveBeenCalled()
  })

  it('has no room with that code, and goes home', async () => {
    given({ error: 'not_found' })
    const onLeave = renderRoom()
    expect(screen.getByText('No room with that code')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Home' }))
    expect(onLeave).toHaveBeenCalled()
  })

  it('says the room has ended when it was there before', () => {
    given({ room: ROOM, you: HOST, error: 'not_found' })
    renderRoom()
    expect(screen.getByText('This room has ended')).toBeInTheDocument()
  })

  it('says when the room was opened in another tab', () => {
    given({ room: ROOM, you: HOST, error: 'replaced' })
    renderRoom()
    expect(screen.getByText('This room is open in another tab')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Home' })).toBeInTheDocument()
  })

  it('says when the room ran into a problem, and goes home', async () => {
    given({ room: ROOM, you: HOST, error: 'broken' })
    const onLeave = renderRoom()
    expect(screen.getByText("This room ran into a problem and can't continue.")).toBeInTheDocument()
    expect(screen.getByText('Room KQMZ')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Home' }))
    expect(onLeave).toHaveBeenCalled()
  })

  it('updates the app when the room needs a newer one', () => {
    vi.mocked(updateNow).mockReturnValue(true)
    given({ error: 'old_version' })
    renderRoom()
    expect(updateNow).toHaveBeenCalledWith('KQMZ')
    expect(screen.getByRole('status')).toHaveTextContent('Updating to keep playing…')
  })

  it('asks for an update when none has come after 8 seconds', () => {
    vi.useFakeTimers()
    vi.mocked(updateNow).mockReturnValue(true)
    given({ error: 'old_version' })
    renderRoom()
    act(() => vi.advanceTimersByTime(7999))
    expect(screen.getByRole('status')).toHaveTextContent('Updating to keep playing…')
    act(() => vi.advanceTimersByTime(1))
    expect(screen.getByRole('status')).toHaveTextContent('Update the app to keep playing. Close it and open it again.')
    expect(screen.getByRole('button', { name: 'Home' })).toBeInTheDocument()
    vi.useRealTimers()
  })

  it('asks for an update when one was tried already for this room', async () => {
    vi.mocked(updateNow).mockReturnValue(false)
    given({ error: 'old_version' })
    const onLeave = renderRoom()
    expect(screen.getByRole('status')).toHaveTextContent('Update the app to keep playing. Close it and open it again.')
    await userEvent.click(screen.getByRole('button', { name: 'Home' }))
    expect(onLeave).toHaveBeenCalled()
  })

  it('tells the lobby when the connection drops', () => {
    given({ room: ROOM, you: HOST, status: 'reconnecting' })
    renderRoom()
    expect(screen.getByText('Reconnecting…')).toBeInTheDocument()
  })

  it('shows the lobby, and the host edits the settings there', async () => {
    given({ room: ROOM, you: HOST })
    renderRoom()
    expect(screen.getByText('KQMZ')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Change settings' }))
    expect(screen.getByRole('heading', { level: 1, name: 'Room settings' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /Turn timer/ }))
    await userEvent.click(screen.getByRole('radio', { name: 'Relaxed' }))
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(send).toHaveBeenCalledWith({ t: 'settings', settings: ROOM.settings, timer: 'relaxed', open: false })
    expect(screen.getByText('KQMZ')).toBeInTheDocument()
  })

  it('shows the game once it starts, and the lobby again after a rematch', () => {
    given({ room: { ...ROOM, phase: 'playing' }, you: HOST })
    const { rerender } = render(<RoomScreen code="KQMZ" device="d1" name="Ama" timing={FAST_TIMING} onLeave={vi.fn()} prefs={prefs} />)
    expect(screen.getByText('Game in progress')).toBeInTheDocument()
    given({ room: { ...ROOM, phase: 'finished' }, you: { id: 2, seat: 'yellow', host: false } })
    rerender(<RoomScreen code="KQMZ" device="d1" name="Ama" timing={FAST_TIMING} onLeave={vi.fn()} prefs={prefs} />)
    expect(screen.getByText('Game in progress')).toBeInTheDocument()
    given({ room: ROOM, you: { id: 2, seat: 'yellow', host: false } })
    rerender(<RoomScreen code="KQMZ" device="d1" name="Ama" timing={FAST_TIMING} onLeave={vi.fn()} prefs={prefs} />)
    expect(screen.queryByText('Game in progress')).toBeNull()
    expect(screen.getByText('KQMZ')).toBeInTheDocument()
  })

  it('a screen that throws shows the problem and the way home, not a blank page', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(OnlineGame).mockImplementation(() => {
      throw new Error('boom')
    })
    try {
      given({ room: { ...ROOM, phase: 'playing' }, you: HOST })
      const onLeave = renderRoom()
      expect(screen.getByText("This room ran into a problem and can't continue.")).toBeInTheDocument()
      expect(screen.getByText('Room KQMZ')).toBeInTheDocument()
      expect(error).toHaveBeenCalledWith('room KQMZ: the screen failed', expect.any(Error))
      await userEvent.click(screen.getByRole('button', { name: 'Home' }))
      expect(onLeave).toHaveBeenCalled()
    } finally {
      vi.mocked(OnlineGame).mockImplementation(() => <p>Game in progress</p>)
      error.mockRestore()
    }
  })

  describe('a quick room with no seat for you', () => {
    const QUICK: RoomView = { ...ROOM, open: 'quick' }

    it('says so once, on the first word from the room', () => {
      given({ room: QUICK, you: { id: 2, host: false } })
      const onNoSeat = vi.fn()
      renderRoom(onNoSeat)
      expect(onNoSeat).toHaveBeenCalledTimes(1)
    })

    it('is quiet when you have a seat', () => {
      given({ room: QUICK, you: { id: 2, seat: 'green', host: false } })
      const onNoSeat = vi.fn()
      renderRoom(onNoSeat)
      expect(onNoSeat).not.toHaveBeenCalled()
    })

    it('is only watching without onNoSeat', () => {
      given({ room: QUICK, you: { id: 2, host: false } })
      renderRoom()
      expect(screen.getByText('KQMZ')).toBeInTheDocument()
    })

    it('judges only the first word: a seat lost later is not a miss', () => {
      given({ room: QUICK, you: { id: 2, seat: 'green', host: false } })
      const onNoSeat = vi.fn()
      const { rerender } = render(<RoomScreen code="KQMZ" device="d1" name="Ama" timing={FAST_TIMING} onLeave={vi.fn()} onNoSeat={onNoSeat} prefs={prefs} />)
      given({ room: { ...QUICK, seq: 1 }, you: { id: 2, host: false } })
      rerender(<RoomScreen code="KQMZ" device="d1" name="Ama" timing={FAST_TIMING} onLeave={vi.fn()} onNoSeat={onNoSeat} prefs={prefs} />)
      expect(onNoSeat).not.toHaveBeenCalled()
    })
  })
})
