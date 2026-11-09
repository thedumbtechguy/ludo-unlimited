import type { Listing } from '@ludo/engine'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FindGame } from './FindGame'

const quickLobby: Listing = { code: 'QWRT', kind: 'quick', mode: 'ghana', phase: 'lobby', players: 4, humans: 2, seatsFree: 2, computerSeats: [], timer: 'normal' }
const hostedGame: Listing = { code: 'KQMZ', kind: 'hosted', mode: 'custom', phase: 'playing', players: 4, humans: 2, seatsFree: 0, computerSeats: ['green', 'blue'], timer: 'quick', host: 'Kofi' }

const renderFind = (load: () => Promise<Listing[]>) => {
  const onOpen = vi.fn()
  const onQuick = vi.fn()
  render(<FindGame load={load} onOpen={onOpen} onQuick={onQuick} onBack={vi.fn()} />)
  return { onOpen, onQuick }
}

describe('FindGame', () => {
  afterEach(() => vi.useRealTimers())

  it('lists the open rooms, and opens one', async () => {
    const { onOpen } = renderFind(async () => [quickLobby, hostedGame])
    const rows = await screen.findAllByTestId('listing')
    expect(rows.map((r) => r.textContent)).toEqual(['Ghana kicks · QuickWaiting · 2 of 4 · Normal', 'Custom · Kofi’s roomPlaying · Green, Blue free · Quick'])
    await userEvent.click(rows[1])
    expect(onOpen).toHaveBeenCalledWith('KQMZ')
  })

  it('with none, offers Quick match', async () => {
    const { onQuick } = renderFind(async () => [])
    await userEvent.click(await screen.findByRole('button', { name: 'Quick match' }))
    expect(screen.getByText('No open games right now')).toBeInTheDocument()
    expect(onQuick).toHaveBeenCalled()
  })

  it('a failed load offers Try again', async () => {
    const load = vi.fn().mockRejectedValueOnce(new Error('failed')).mockResolvedValue([quickLobby])
    renderFind(load)
    await userEvent.click(await screen.findByRole('button', { name: 'Try again' }))
    expect(await screen.findAllByTestId('listing')).toHaveLength(1)
  })

  it('refreshes every 5 s', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const load = vi.fn().mockResolvedValue([])
    renderFind(load)
    await act(async () => vi.advanceTimersByTimeAsync(5000))
    expect(load).toHaveBeenCalledTimes(2)
  })
})
