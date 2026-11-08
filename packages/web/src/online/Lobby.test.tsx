import { MODES, type MemberView, type RoomView, type YouView } from '@ludo/engine'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Lobby } from './Lobby'

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
  log: [],
  seq: 0,
})
const ama: MemberView = { id: 1, name: 'Ama', connected: true, seat: 'red' }
const kofi: MemberView = { id: 2, name: 'Kofi', connected: true, seat: 'green' }
const esi: MemberView = { id: 3, name: 'Esi', connected: true }

function renderLobby(r: RoomView, you: YouView) {
  const send = vi.fn()
  const onSettings = vi.fn()
  const { unmount } = render(<Lobby room={r} you={you} send={send} onSettings={onSettings} onLeave={vi.fn()} />)
  return { send, onSettings, unmount }
}
const seatRows = () => screen.getAllByTestId('seat').map((row) => row.textContent)

describe('Lobby', () => {
  afterEach(() => vi.unstubAllGlobals())

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
    expect(screen.getByText('Ghana rules')).toBeInTheDocument()
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
})
