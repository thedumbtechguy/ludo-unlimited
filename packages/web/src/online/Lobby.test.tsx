import { createGame, MODES, type MemberView, type RoomView, type YouView } from '@ludo/engine'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Lobby } from './Lobby'
import type { Status } from './socket'

const room = (members: MemberView[], players: 2 | 3 | 4 = 4): RoomView => ({
  code: 'KQMZ',
  phase: 'lobby',
  host: 1,
  settings: { players, endCondition: 'firstWins', rules: MODES.ghana.rules, afterKick: 'normal' },
  timer: 'normal',
  members,
  computers: [],
  covering: [],
  paused: false,
  game: createGame({ players, endCondition: 'firstWins', rules: MODES.ghana.rules, afterKick: 'normal' }),
  seq: 0,
})
const ama: MemberView = { id: 1, name: 'Ama', connected: true, seat: 'red' }
const kofi: MemberView = { id: 2, name: 'Kofi', connected: true, seat: 'green' }
const esi: MemberView = { id: 3, name: 'Esi', connected: true }

function renderLobby(r: RoomView, you: YouView, status: Status = 'open', startAt?: number) {
  const send = vi.fn()
  const onSettings = vi.fn()
  const { unmount } = render(<Lobby room={r} you={you} status={status} send={send} onSettings={onSettings} onLeave={vi.fn()} startAt={startAt} />)
  return { send, onSettings, unmount }
}
const seatRows = () => screen.getAllByTestId('seat').map((row) => row.textContent)

describe('Lobby', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('shows the code and a row per seat, naming the host', () => {
    renderLobby(room([ama, kofi, esi]), { id: 3, host: false })
    expect(screen.getByText('KQMZ')).toBeInTheDocument()
    expect(seatRows()).toEqual(['Red: Ama (host)', 'Green: Kofi', 'YellowTap to sit', 'BlueTap to sit'])
    expect(screen.getByText('1 watching')).toBeInTheDocument()
  })

  it('sits you in a free seat, and offers Stand up in your own', async () => {
    const { send } = renderLobby(room([ama, esi], 2), { id: 3, host: false })
    await userEvent.click(screen.getByRole('button', { name: 'Tap to sit as Yellow' }))
    expect(send).toHaveBeenCalledWith({ t: 'sit', color: 'yellow' })
  })

  it('a seat whose player is away stays theirs: no Tap to sit, and they are not counted to play', () => {
    renderLobby(room([ama, { ...kofi, connected: false }, esi]), { id: 3, host: false })
    expect(seatRows()).toEqual(['Red: Ama (host)', 'Green: Kofi (away)', 'YellowTap to sit', 'BlueTap to sit'])
    expect(screen.queryByRole('button', { name: 'Tap to sit as Green' })).toBeNull()
  })

  it('leaves players who are away out of the count to start with', async () => {
    renderLobby(room([ama, { ...kofi, connected: false }, { ...esi, seat: 'yellow' }]), { id: 1, seat: 'red', host: true })
    await userEvent.click(screen.getByRole('button', { name: 'Start' }))
    const sheet = screen.getByRole('dialog', { name: '2 empty seats' })
    expect(within(sheet).getByRole('button', { name: 'Play with 2' })).toBeInTheDocument()
  })

  it('cannot start when the only seated player is away', () => {
    renderLobby(room([{ ...ama, seat: undefined }, { ...kofi, connected: false }]), { id: 1, host: true })
    expect(screen.getByRole('button', { name: 'Start' })).toBeDisabled()
  })

  it('lets you stand up from your seat, and not sit in another', async () => {
    const { send } = renderLobby(room([ama, kofi]), { id: 2, seat: 'green', host: false })
    expect(screen.queryByRole('button', { name: /Tap to sit/ })).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Stand up' }))
    expect(send).toHaveBeenCalledWith({ t: 'stand' })
  })

  it('tells everyone but the host who starts', () => {
    renderLobby(room([ama, kofi]), { id: 2, seat: 'green', host: false })
    expect(screen.getByText('Waiting for Ama to start')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Start' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Change settings' })).toBeNull()
    expect(screen.getAllByRole('paragraph').filter((p) => p.classList.contains('row')).map((p) => p.textContent)).toEqual([
      'RulesGhana rules',
      'After a kickCarry on',
      'Game endsWhen one player wins',
      'Who can joinFriends with the code',
      'Turn timerNormal',
    ])
  })

  it('gives the host Settings', async () => {
    const { onSettings } = renderLobby(room([ama]), { id: 1, seat: 'red', host: true })
    await userEvent.click(screen.getByRole('button', { name: 'Change settings' }))
    expect(onSettings).toHaveBeenCalled()
  })

  it('starts straight away when every seat is taken', async () => {
    const { send } = renderLobby(room([ama, { ...kofi, seat: 'yellow' }], 2), { id: 1, seat: 'red', host: true })
    await userEvent.click(screen.getByRole('button', { name: 'Start' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(send).toHaveBeenCalledWith({ t: 'start', empty: 'computers' })
  })

  it('asks the host what to do with empty seats', async () => {
    const { send } = renderLobby(room([ama, { ...kofi, seat: 'yellow' }]), { id: 1, seat: 'red', host: true })
    await userEvent.click(screen.getByRole('button', { name: 'Start' }))
    const sheet = screen.getByRole('dialog', { name: '2 empty seats' })
    await userEvent.click(within(sheet).getByRole('button', { name: 'Play with 2' }))
    expect(send).toHaveBeenCalledWith({ t: 'start', empty: 'drop' })
    expect(screen.queryByRole('dialog')).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Start' }))
    await userEvent.click(screen.getByRole('button', { name: 'Fill with computers' }))
    expect(send).toHaveBeenLastCalledWith({ t: 'start', empty: 'computers' })
  })

  it('only offers to fill with computers when one person is seated', async () => {
    renderLobby(room([ama]), { id: 1, seat: 'red', host: true })
    await userEvent.click(screen.getByRole('button', { name: 'Start' }))
    const sheet = screen.getByRole('dialog', { name: '3 empty seats' })
    expect(within(sheet).getAllByRole('button').map((b) => b.textContent)).toEqual(['Fill with computers'])
  })

  it('cannot start with nobody seated', () => {
    renderLobby(room([{ ...ama, seat: undefined }]), { id: 1, host: true })
    expect(screen.getByRole('button', { name: 'Start' })).toBeDisabled()
  })

  it('shares the link, or copies it when sharing is not available', async () => {
    const share = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { ...navigator, share })
    const { unmount } = renderLobby(room([ama]), { id: 1, seat: 'red', host: true })
    await userEvent.click(screen.getByRole('button', { name: 'Share link' }))
    expect(share).toHaveBeenCalledWith(expect.objectContaining({ url: `${location.origin}/r/KQMZ` }))
    unmount()

    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { ...navigator, share: undefined, clipboard: { writeText } })
    renderLobby(room([ama]), { id: 1, seat: 'red', host: true })
    await userEvent.click(screen.getByRole('button', { name: 'Share link' }))
    expect(writeText).toHaveBeenCalledWith(`${location.origin}/r/KQMZ`)
    expect(screen.getByRole('button', { name: 'Link copied' })).toBeInTheDocument()
  })

  it('says when it is reconnecting, and holds taps until it is back', () => {
    renderLobby(room([ama, { ...kofi, seat: 'yellow' }]), { id: 1, seat: 'red', host: true }, 'reconnecting')
    expect(screen.getByRole('status')).toHaveTextContent('Reconnecting…')
    expect(screen.getByRole('button', { name: 'Start' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Stand up' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Change settings' })).toBeDisabled()
  })

  it('holds sitting down while reconnecting', () => {
    renderLobby(room([ama, esi]), { id: 3, host: false }, 'reconnecting')
    expect(screen.getByRole('button', { name: 'Tap to sit as Green' })).toBeDisabled()
  })

  it('goes back to Share link a moment after copying', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('navigator', { ...navigator, share: undefined, clipboard: { writeText: () => Promise.resolve() } })
    renderLobby(room([ama]), { id: 1, seat: 'red', host: true })
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Share link' })))
    expect(screen.getByRole('button', { name: 'Link copied' })).toBeInTheDocument()
    act(() => vi.advanceTimersByTime(2000))
    expect(screen.getByRole('button', { name: 'Share link' })).toBeInTheDocument()
  })

  it('shows the link to copy by hand when the clipboard says no', async () => {
    vi.stubGlobal('navigator', { ...navigator, share: undefined, clipboard: { writeText: () => Promise.reject(new Error('denied')) } })
    renderLobby(room([ama]), { id: 1, seat: 'red', host: true })
    await userEvent.click(screen.getByRole('button', { name: 'Share link' }))
    expect(screen.getByRole('textbox', { name: /Couldn’t share/ })).toHaveValue(`${location.origin}/r/KQMZ`)
  })

  it('shows the link to copy by hand when there is neither sharing nor a clipboard (plain http)', async () => {
    vi.stubGlobal('navigator', { ...navigator, share: undefined, clipboard: undefined })
    renderLobby(room([ama]), { id: 1, seat: 'red', host: true })
    await userEvent.click(screen.getByRole('button', { name: 'Share link' }))
    expect(screen.getByRole('textbox', { name: /Couldn’t share/ })).toHaveValue(`${location.origin}/r/KQMZ`)
  })

  it('does nothing when the share sheet is closed', async () => {
    const share = vi.fn().mockRejectedValue(Object.assign(new Error('closed'), { name: 'AbortError' }))
    vi.stubGlobal('navigator', { ...navigator, share })
    renderLobby(room([ama]), { id: 1, seat: 'red', host: true })
    await userEvent.click(screen.getByRole('button', { name: 'Share link' }))
    expect(screen.queryByRole('textbox')).toBeNull()
  })

  it('a room open to anyone says so by its code', () => {
    renderLobby({ ...room([ama]), open: 'hosted' }, { id: 1, seat: 'red', host: true })
    expect(screen.getByText('Open')).toBeInTheDocument()
    expect(screen.getByText('Anyone')).toBeInTheDocument()
  })

  it('a room for friends has no Open tag', () => {
    renderLobby(room([ama]), { id: 1, seat: 'red', host: true })
    expect(screen.queryByText('Open')).toBeNull()
    expect(screen.getByText('Friends with the code')).toBeInTheDocument()
  })

  it('a quick room has no seat buttons, settings to change or Start, and counts down', () => {
    vi.useFakeTimers()
    renderLobby({ ...room([ama, kofi]), open: 'quick', host: 0 }, { id: 2, seat: 'green', host: false }, 'open', Date.now() + 14_000)
    expect(screen.queryByRole('button', { name: /Tap to sit|Stand up|Change settings|Start/ })).toBeNull()
    expect(screen.queryByText('Who can join')).toBeNull()
    expect(screen.getByText('Starting in 14 s, computers fill empty seats')).toBeInTheDocument()
    act(() => vi.advanceTimersByTime(4000))
    expect(screen.getByText('Starting in 10 s, computers fill empty seats')).toBeInTheDocument()
  })

  it('a quick room with no countdown waits for players', () => {
    renderLobby({ ...room([]), open: 'quick', host: 0 }, { id: 2, host: false })
    expect(screen.getByText('Waiting for players')).toBeInTheDocument()
  })
})
