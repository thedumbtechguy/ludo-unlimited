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
function onlineFor({ room = {}, you = AMA, clock = {}, status = 'open', game = createGame(settings) }: Given, send: () => boolean) {
  const { result } = renderHook(() => useGameView({ initial: game, timing: FAST_TIMING, you: you.seat, controls: (c) => c === you.seat, act: noop }))
  return {
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
}

function renderOnline(given: Given = {}) {
  const send = vi.fn(() => true)
  const onLeave = vi.fn()
  const ui = (g: Given) => (
    <OnlineGame
      online={onlineFor(g, send)}
      animated={g.animated ?? false}
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
    />
  )
  const { rerender } = render(ui(given))
  return { send, onLeave, rerender: (g: Given) => rerender(ui(g)) }
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
    expect(dice().querySelector('.turn-label')).toHaveTextContent("Ama's turn")
  })

  it('cuts a long name short, never the "\'s turn" after it', () => {
    const long = 'TheVirginBrokey'
    renderOnline({ you: KOFI, room: { members: [{ ...ROOM.members[0], name: long }, ROOM.members[1]] } })
    const label = dice().querySelector('.turn-label')!
    expect(label.querySelector('.turn-name')).toHaveTextContent(long)
    expect(label.querySelector('.turn-of')).toHaveTextContent("'s turn")
  })

  it('shows nobody watching when everyone has a seat', () => {
    renderOnline()
    expect(screen.queryByRole('button', { name: /watching/ })).toBeNull()
  })

  it('counts the connected watchers in the top bar, and names them in a sheet', async () => {
    const members = [
      ...ROOM.members,
      { id: 3, name: 'Esi', connected: true },
      { id: 4, name: 'Yaw', connected: true },
      { id: 5, name: 'Gone', connected: false },
    ]
    renderOnline({ room: { members } })
    const button = screen.getByRole('button', { name: '2 watching' })
    expect(button.closest('header.topbar')).not.toBeNull()
    await userEvent.click(button)
    const sheet = screen.getByRole('dialog', { name: 'Watching' })
    expect([...sheet.querySelectorAll('li')].map((li) => li.textContent)).toEqual(['Esi', 'Yaw'])
  })

  it('a watcher sees themselves in the list', async () => {
    renderOnline({ you: WATCHER, room: { members: [...ROOM.members, { id: 3, name: 'Esi', connected: true }] } })
    await userEvent.click(screen.getByRole('button', { name: '1 watching' }))
    expect(within(screen.getByRole('dialog', { name: 'Watching' })).getByText('Esi (you)')).toBeInTheDocument()
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

  it('keeps the react button in the top bar during your own turn, beside Menu', async () => {
    const { send } = renderOnline({ you: AMA })
    expect(screen.getByText('Tap the dice to roll')).toBeInTheDocument()
    const react = screen.getByRole('button', { name: 'React' })
    expect(react.closest('header.topbar')).not.toBeNull()
    expect(react.nextElementSibling).toBe(screen.getByRole('button', { name: 'Menu' }))
    await userEvent.click(react)
    await userEvent.click(screen.getByRole('button', { name: '🔥' }))
    expect(send).toHaveBeenCalledWith({ t: 'react', id: 'fire' })
    expect(screen.getByRole('button', { name: 'React' })).toBeDisabled()
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

  it('a watcher can play as a computer seat', async () => {
    const { send } = renderOnline({ you: WATCHER, room: { members: [ROOM.members[0]], computers: ['yellow'] } })
    expect(screen.getByText('Want to play?')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Play as Yellow' }))
    expect(send).toHaveBeenCalledWith({ t: 'takeover', color: 'yellow' })
  })

  it('offers each computer seat, even while paused', () => {
    const four = settingsFor('classic', 4, 'firstWins')
    renderOnline({
      you: WATCHER,
      game: createGame(four),
      room: { settings: four, members: [ROOM.members[0]], computers: ['green', 'yellow', 'blue'] },
      clock: { paused: true },
    })
    expect(screen.getByText('Paused')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /^Play as/ }).map((b) => b.textContent)).toEqual(['Play as Green', 'Play as Yellow', 'Play as Blue'])
  })

  it('never offers the seat of a player who left', () => {
    renderOnline({
      you: WATCHER,
      room: { members: [ROOM.members[0], { id: 2, name: 'Kofi', connected: false, seat: 'yellow' }] },
      clock: { covering: ['yellow'] },
    })
    expect(screen.queryByRole('button', { name: /^Play as|^Rejoin/ })).toBeNull()
    expect(screen.queryByText('Want to play?')).toBeNull()
  })

  it('no Play as for a seated player, or while reconnecting', () => {
    const computer = { members: [ROOM.members[0]], computers: ['yellow' as const] }
    const { rerender } = renderOnline({ room: computer })
    expect(screen.queryByRole('button', { name: /^Play as/ })).toBeNull()
    rerender({ you: WATCHER, room: computer, status: 'reconnecting' })
    expect(screen.queryByRole('button', { name: /^Play as/ })).toBeNull()
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

    it('are gone when reconnecting lands in a new game', async () => {
      const { rerender } = renderOnline({ room: { phase: 'finished' }, game: finished() })
      await act(async () => {})
      expect(screen.getByRole('button', { name: 'Rematch' })).toBeInTheDocument()
      rerender({ room: { phase: 'playing' } })
      expect(screen.queryByRole('button', { name: 'Rematch' })).toBeNull()
      expect(dice()).toBeInTheDocument()
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
