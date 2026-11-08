import { createGame, settingsFor, track, type Move } from '@ludo/engine'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Board } from './Board'

const game = (players: 2 | 3 | 4 = 4) => createGame(settingsFor('classic', players, 'firstWins'))
const red0 = { color: 'red', index: 0 } as const

describe('Board', () => {
  it('draws 72 path tiles and every seated piece', () => {
    render(<Board state={game()} />)
    expect(screen.getAllByTestId('tile')).toHaveLength(72)
    expect(screen.getAllByTestId('piece')).toHaveLength(16)
  })

  it('draws only the seated colours’ pieces', () => {
    render(<Board state={game(2)} />)
    expect(screen.getAllByTestId('piece')).toHaveLength(8)
  })

  it('makes movable pieces buttons that select', async () => {
    const onSelectPiece = vi.fn()
    render(<Board state={game()} movable={[red0]} onSelectPiece={onSelectPiece} />)
    await userEvent.click(screen.getByRole('button', { name: 'Red piece 1, in base' }))
    expect(onSelectPiece).toHaveBeenCalledWith(red0)
  })

  it('makes targets buttons that pick the move', async () => {
    const onPickTarget = vi.fn()
    const move: Move = { kind: 'forward', piece: red0, to: track(8), kick: { color: 'yellow', index: 0 } }
    render(<Board state={game()} selected={red0} targets={[move]} onPickTarget={onPickTarget} />)
    expect(screen.getAllByTestId('target-marker')).toHaveLength(1)
    await userEvent.click(screen.getByRole('button', { name: 'Kick Yellow on square 9' }))
    expect(onPickTarget).toHaveBeenCalledWith(move)
  })

  it('shows a labourer badge on the victim’s yard', () => {
    const state = game()
    state.labourers = { yellow: 'red' }
    render(<Board state={state} />)
    expect(screen.getByText('Labourer to Red')).toBeInTheDocument()
  })

  it('draws a moving piece at its animated square', () => {
    render(<Board state={game()} moving={{ piece: red0, at: track(0) }} />)
    const piece = screen.getAllByTestId('piece').find((el) => el.getAttribute('data-piece') === 'red-0')!
    expect(piece.style.transform).toBe('translate(60px, 260px)')
  })

  it('draws target markers after the pieces so they are not covered', () => {
    const move: Move = { kind: 'forward', piece: red0, to: track(8), kick: { color: 'yellow', index: 0 } }
    render(<Board state={game()} selected={red0} targets={[move]} />)
    const marker = screen.getByTestId('target-marker')
    const pieces = screen.getAllByTestId('piece')
    expect(pieces.every((el) => el.compareDocumentPosition(marker) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true)
    expect(marker).toHaveAttribute('pointer-events', 'none')
    expect(marker).toHaveAttribute('r', '22')
  })

  it('deselects when the background is clicked but not when a target is', async () => {
    const onDeselect = vi.fn()
    const move: Move = { kind: 'forward', piece: red0, to: track(8) }
    const { container } = render(<Board state={game()} selected={red0} targets={[move]} onDeselect={onDeselect} />)
    await userEvent.click(screen.getByRole('button', { name: /square 9/ }))
    expect(onDeselect).not.toHaveBeenCalled()
    await userEvent.click(container.querySelector('.board')!)
    expect(onDeselect).toHaveBeenCalledTimes(1)
  })

  it('only renders the selected piece’s button while a piece is selected', () => {
    const red1 = { color: 'red', index: 1 } as const
    const move: Move = { kind: 'forward', piece: red0, to: track(8) }
    const { rerender } = render(<Board state={game()} movable={[red0, red1]} />)
    expect(screen.getAllByRole('button')).toHaveLength(2)
    rerender(<Board state={game()} movable={[red0, red1]} selected={red0} targets={[move]} />)
    expect(screen.getAllByRole('button')).toHaveLength(2)
    expect(screen.queryByRole('button', { name: /Red piece 2/ })).toBeNull()
    expect(screen.getByRole('button', { name: /Red piece 1/ })).toBeInTheDocument()
  })
})
