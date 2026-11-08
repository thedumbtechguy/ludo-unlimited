import { MODES, type ErrorCode, type RoomView, type YouView } from '@ludo/engine'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { updateNow } from '../update'
import { FAST_TIMING } from '../useGame'
import { RoomScreen } from './RoomScreen'
import { useOnlineGame } from './useOnlineGame'

vi.mock('./useOnlineGame', () => ({ useOnlineGame: vi.fn() }))
vi.mock('../update', () => ({ updateNow: vi.fn() }))

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
  log: [],
  seq: 0,
}
const HOST: YouView = { id: 1, seat: 'red', host: true }
const send = vi.fn()

function given(state: { room?: RoomView; you?: YouView; error?: ErrorCode }) {
  vi.mocked(useOnlineGame).mockReturnValue({ ...state, send } as unknown as ReturnType<typeof useOnlineGame>)
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
function renderRoom() {
  const onLeave = vi.fn()
  render(<RoomScreen code="KQMZ" device="d1" name="Ama" timing={FAST_TIMING} onLeave={onLeave} prefs={prefs} />)
  return onLeave
}

describe('RoomScreen', () => {
  beforeEach(() => vi.clearAllMocks())

  it('says it is connecting until the room arrives', () => {
    given({})
    renderRoom()
    expect(screen.getByText('Connecting…')).toBeInTheDocument()
    expect(useOnlineGame).toHaveBeenCalledWith({ code: 'KQMZ', device: 'd1', name: 'Ama', timing: FAST_TIMING })
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

  it('updates the app when the room needs a newer one', () => {
    given({ error: 'old_version' })
    renderRoom()
    expect(updateNow).toHaveBeenCalled()
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
    expect(send).toHaveBeenCalledWith({ t: 'settings', settings: ROOM.settings, timer: 'relaxed' })
    expect(screen.getByText('KQMZ')).toBeInTheDocument()
  })

  it('shows the game once it starts', () => {
    given({ room: { ...ROOM, phase: 'playing' }, you: HOST })
    renderRoom()
    expect(screen.getByText('Game in progress')).toBeInTheDocument()
  })
})
