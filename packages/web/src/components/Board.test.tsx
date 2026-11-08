import { createGame, settingsFor, track, type Move } from '@ludo/engine'
import { render, screen, within } from '@testing-library/react'
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

  describe('numbered pieces and destinations', () => {
    const red1 = { color: 'red', index: 1 } as const
    const yellow0 = { color: 'yellow', index: 0 } as const
    const twoPieces = () => {
      const state = game()
      state.players[0].pieces[0] = track(5)
      state.players[0].pieces[1] = track(1)
      state.pendingRoll = 3
      return state
    }
    const a: Move = { kind: 'forward', piece: red0, to: track(8) }
    const b: Move = { kind: 'forward', piece: red1, to: track(4) }

    it('numbers each movable piece when 2+ can move', () => {
      render(<Board state={twoPieces()} movable={[red0, red1]} targets={[a, b]} />)
      expect(screen.getAllByTestId('piece-number').map((el) => el.textContent)).toEqual(['1', '2'])
    })

    it('does not number a lone movable piece', () => {
      render(<Board state={twoPieces()} movable={[red0]} targets={[a]} />)
      expect(screen.queryAllByTestId('piece-number')).toHaveLength(0)
      expect(screen.getByRole('button', { name: 'Move on square 9' })).toBeInTheDocument()
    })

    it('renders every target with its piece number when nothing is selected', () => {
      render(<Board state={twoPieces()} movable={[red0, red1]} targets={[a, b]} />)
      expect(screen.getAllByTestId('target-marker')).toHaveLength(2)
      expect(screen.getAllByTestId('target-number').map((el) => el.textContent)).toEqual(['1', '2'])
      expect(screen.getByRole('button', { name: 'Piece 1: Move on square 9' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Piece 2: Move on square 5' })).toBeInTheDocument()
    })

    it('draws the targets after the pieces, so they win on shared squares', () => {
      render(<Board state={twoPieces()} movable={[red0, red1]} targets={[a, b]} />)
      const buttons = screen.getAllByRole('button').map((el) => el.getAttribute('aria-label'))
      expect(buttons).toEqual(['Piece 1: Red, on square 6', 'Piece 2: Red, on square 2', 'Piece 1: Move on square 9', 'Piece 2: Move on square 5'])
    })

    it('clicking a target plays it', async () => {
      const onPickTarget = vi.fn()
      render(<Board state={twoPieces()} movable={[red0, red1]} targets={[a, b]} onPickTarget={onPickTarget} />)
      await userEvent.click(screen.getByRole('button', { name: 'Piece 2: Move on square 5' }))
      expect(onPickTarget).toHaveBeenCalledWith(b)
    })

    it('a shared square shows both numbers and opens a chooser whose buttons play the right move', async () => {
      const onPickTarget = vi.fn()
      const onDeselect = vi.fn()
      const state = twoPieces()
      state.players.find((p) => p.color === 'yellow')!.pieces[0] = track(8)
      const viaA: Move = { kind: 'forward', piece: red0, to: track(8), kick: yellow0 }
      const viaB: Move = { kind: 'forward', piece: red1, to: track(8), kick: yellow0, rolls: 2 }
      state.queuedRolls = [3]
      render(<Board state={state} movable={[red0, red1]} targets={[viaA, viaB]} onPickTarget={onPickTarget} onDeselect={onDeselect} />)
      expect(screen.getAllByTestId('target-marker')).toHaveLength(1)
      expect(screen.getByTestId('target-number')).toHaveTextContent('1·2')
      await userEvent.click(screen.getByRole('button', { name: 'Pieces 1 and 2 can reach square 9: choose one' }))
      expect(onPickTarget).not.toHaveBeenCalled()
      const chooser = screen.getByRole('group', { name: 'Choose a piece for square 9' })
      const options = within(chooser).getAllByRole('button')
      expect(options.map((el) => el.textContent)).toEqual(['Piece 1Kick Yellow', 'Piece 2Kick Yellow · 3+3'])
      await userEvent.click(within(chooser).getByRole('button', { name: 'Piece 2: Kick Yellow on square 9 using 3+3' }))
      expect(onPickTarget).toHaveBeenCalledWith(viaB)
      expect(onDeselect).not.toHaveBeenCalled()
    })

    it('labels a combined move with its total', () => {
      const state = twoPieces()
      state.pendingRoll = 6
      state.queuedRolls = [4]
      const combined: Move = { kind: 'back', piece: red0, to: track(15), kick: yellow0, rolls: 2 }
      render(<Board state={state} movable={[red0, red1]} targets={[combined, b]} />)
      expect(screen.getByTestId('target-rolls')).toHaveTextContent('6+4')
      expect(screen.getByRole('button', { name: 'Piece 1: Kick Yellow on square 16 using 6+4' })).toBeInTheDocument()
    })

    it('reports the target being hovered or focused', async () => {
      const onPreview = vi.fn()
      render(<Board state={twoPieces()} movable={[red0, red1]} targets={[a, b]} onPreview={onPreview} />)
      await userEvent.hover(screen.getByRole('button', { name: 'Piece 1: Move on square 9' }))
      expect(onPreview).toHaveBeenLastCalledWith(a)
      await userEvent.unhover(screen.getByRole('button', { name: 'Piece 1: Move on square 9' }))
      expect(onPreview).toHaveBeenLastCalledWith(undefined)
    })

    it('with a piece selected shows only that piece and its targets, unnumbered', () => {
      render(<Board state={twoPieces()} movable={[red0, red1]} selected={red0} targets={[a]} />)
      expect(screen.queryAllByTestId('piece-number')).toHaveLength(0)
      expect(screen.getAllByRole('button').map((el) => el.getAttribute('aria-label'))).toEqual(['Red piece 1, on square 6', 'Move on square 9'])
    })
  })

  it('a destination on another movable piece leaves that square to the piece', async () => {
    const state = game()
    state.players[0].pieces[2] = track(6)
    state.players[0].pieces[3] = track(0)
    const red2 = { color: 'red', index: 2 } as const
    const red3 = { color: 'red', index: 3 } as const
    const onSelectPiece = vi.fn()
    const onPickTarget = vi.fn()
    const targets: Move[] = [
      { kind: 'forward', piece: red2, to: track(12) },
      { kind: 'forward', piece: red3, to: track(6) },
    ]
    render(<Board state={state} movable={[red2, red3]} targets={targets} onSelectPiece={onSelectPiece} onPickTarget={onPickTarget} />)
    // The marker still shows, but only the piece's own button sits on that square, so a tap selects it.
    expect(screen.getAllByTestId('target-marker')).toHaveLength(2)
    expect(screen.queryByRole('button', { name: 'Piece 2: Move on square 7' })).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Piece 1: Red, on square 7' }))
    expect(onSelectPiece).toHaveBeenCalledWith(red2)
    expect(onPickTarget).not.toHaveBeenCalled()
  })
})
