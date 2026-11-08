import { createGame, settingsFor, type GameState, type RoomView, type YouView } from '@ludo/engine'
import { act, render, renderHook, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FAST_TIMING } from '../useGame'
import { useGameView } from '../useGameView'
import { OnlineGame } from './OnlineGame'
import type { Clock, useOnlineGame } from './useOnlineGame'
import type { Status } from './socket'

const settings = settingsFor('classic', 2, 'firstWins')
const ROOM: RoomView = {
  code: 'KQZM',
  phase: 'playing',
  host: 1,
  settings,
  timer: 'normal',
  members: [
    { id: 1, name: 'Ama', connected: true, seat: 'red' },
    { id: 2, name: 'Kofi', connected: true, seat: 'yellow' },
  ],
  computers: [],
  covering: [],
  paused: false,
  log: [],
  seq: 0,
}
const AMA: YouView = { id: 1, seat: 'red', host: true }
const KOFI: YouView = { id: 2, seat: 'yellow', host: false }
const WATCHER: YouView = { id: 3, host: false }
const noop = () => {}

type Given = { room?: Partial<RoomView>; you?: YouView; clock?: Partial<Clock>; status?: Status; game?: GameState; animated?: boolean }

/** The online game's view, as `useOnlineGame` would give it, from a plain game view and room fields. */
function renderOnline({ room = {}, you = AMA, clock = {}, status = 'open', game = createGame(settings), animated = false }: Given = {}) {
  const send = vi.fn(() => true)
  const { result } = renderHook(() => useGameView({ initial: game, timing: FAST_TIMING, you: you.seat, controls: (c) => c === you.seat, act: noop }))
  const online = {
    ...result.current,
    room: { ...ROOM, ...room },
    you,
    status,
    error: undefined,
    clock: { paused: false, covering: [], ...clock },
    reactions: [],
    send,
    watching: !you.seat,
  } as ReturnType<typeof useOnlineGame>
  const onLeave = vi.fn()
  render(
    <OnlineGame
      online={online}
      animated={animated}
      onLeave={onLeave}
      hand="right"
      onHand={noop}
      theme="system"
      onTheme={noop}
      effectsLevel="full"
      onEffectsLevel={noop}
      sound={false}
      onSound={noop}
      music={false}
      onMusic={noop}
    />,
  )
  return { send, onLeave }
}
const dice = () => screen.getByRole('region', { name: 'Dice' })

describe('OnlineGame', () => {
  afterEach(() => vi.useRealTimers())

  it('names the yards, marks who is away, and calls computer seats Computer', () => {
    renderOnline({ room: { members: [{ id: 1, name: 'Ama', connected: true, seat: 'red' }, { id: 2, name: 'Kofi', connected: false, seat: 'yellow' }] } })
    expect(screen.getByTestId('yard-label-red')).toHaveTextContent('Ama0 home')
    expect(screen.getByTestId('yard-label-yellow')).toHaveTextContent('Kofi (away)0 home')
  })

  it('calls a computer seat Computer', () => {
    renderOnline({ room: { members: [ROOM.members[0]], computers: ['yellow'] } })
    expect(screen.getByTestId('yard-label-yellow')).toHaveTextContent('Computer0 home')
  })

  it('names the player whose turn it is', () => {
    renderOnline({ you: KOFI })
    expect(within(dice()).getByText("Ama's turn")).toBeInTheDocument()
  })

  it('a watcher sees Watching, never Your turn, and gets no reaction button', () => {
    renderOnline({ you: WATCHER })
    expect(within(dice()).getByText('Watching')).toBeInTheDocument()
    expect(screen.queryByText('Your turn')).toBeNull()
    expect(screen.queryByRole('button', { name: 'React' })).toBeNull()
  })

  it('a seated player can react while it is not their move', async () => {
    const { send } = renderOnline({ you: KOFI })
    await userEvent.click(screen.getByRole('button', { name: 'React' }))
    await userEvent.click(screen.getByRole('button', { name: 'Hurry up' }))
    expect(send).toHaveBeenCalledWith({ t: 'react', id: 'hurry' })
  })

  it('tells the host who left, and pauses to wait for them', async () => {
    const { send } = renderOnline({
      room: { members: [ROOM.members[0], { id: 2, name: 'Kofi', connected: false, seat: 'yellow' }] },
      clock: { covering: ['yellow'] },
    })
    expect(screen.getByText('Kofi left. A computer is playing for them')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Pause and wait' }))
    expect(send).toHaveBeenCalledWith({ t: 'pause', for: 'yellow' })
  })

  it('only the host hears who left', () => {
    renderOnline({ you: KOFI, room: { members: [{ ...ROOM.members[0], connected: false }, ROOM.members[1]] }, clock: { covering: ['red'] } })
    expect(screen.queryByText(/left\. A computer/)).toBeNull()
  })

  it('shows the pause to everyone; only the host can carry on', async () => {
    const { send } = renderOnline({ clock: { paused: true, pausedFor: 'yellow' } })
    expect(screen.getByText('Paused, waiting for Kofi')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Carry on' }))
    expect(send).toHaveBeenCalledWith({ t: 'resume' })
  })

  it('a plain pause, without the host’s button for others', () => {
    renderOnline({ you: KOFI, clock: { paused: true } })
    expect(screen.getByText('Paused')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Carry on' })).toBeNull()
  })

  it('says it is reconnecting while the socket is down', () => {
    renderOnline({ status: 'reconnecting' })
    expect(screen.getByText('Reconnecting…')).toBeInTheDocument()
  })

  it('tells watchers when every player has gone, even a watcher who is now the host', () => {
    renderOnline({
      you: { ...WATCHER, host: true },
      room: { members: ROOM.members.map((m) => ({ ...m, connected: false })) },
      clock: { covering: ['red', 'yellow'] },
    })
    expect(screen.getByText('Waiting for players to come back')).toBeInTheDocument()
    expect(screen.queryByText(/A computer is playing/)).toBeNull()
  })

  it('rings the dice while a person has the clock; not while paused', () => {
    renderOnline({ clock: { deadline: Date.now() + 30_000 } })
    expect(screen.getByRole('img', { name: '30 seconds left' })).toBeInTheDocument()
  })

  it('no ring while paused or with no deadline', () => {
    renderOnline({ clock: { deadline: Date.now() + 30_000, paused: true } })
    expect(screen.queryByRole('img', { name: /seconds left/ })).toBeNull()
  })

  it('the menu leaves the room, with no restart', async () => {
    const { onLeave } = renderOnline()
    await userEvent.click(screen.getByRole('button', { name: 'Menu' }))
    const menu = screen.getByRole('dialog', { name: 'Menu' })
    expect(within(menu).queryByText('Restart game')).toBeNull()
    await userEvent.click(within(menu).getByRole('button', { name: 'Leave room' }))
    expect(onLeave).toHaveBeenCalled()
  })

  describe('results', () => {
    const finished = () => {
      const game = createGame(settings)
      game.status = 'finished'
      game.players[0].finishedPlace = 1
      game.players[1].finishedPlace = 2
      return game
    }

    it('come up once the game is over; the host gets Rematch', async () => {
      const { send } = renderOnline({ room: { phase: 'finished' }, game: finished() })
      await act(async () => {})
      expect(screen.getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Ama1st', 'Kofi2nd'])
      await userEvent.click(screen.getByRole('button', { name: 'Rematch' }))
      expect(send).toHaveBeenCalledWith({ t: 'rematch' })
    })

    it('wait for the host after the finish has played out', () => {
      vi.useFakeTimers()
      renderOnline({ you: KOFI, room: { phase: 'finished' }, game: finished(), animated: true })
      act(() => vi.advanceTimersByTime(2000))
      expect(screen.queryByText('Game over')).toBeNull() // the finish callout is still up
      act(() => vi.advanceTimersByTime(400))
      expect(screen.getByText('Waiting for Ama')).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Rematch' })).toBeNull()
    })
  })
})
