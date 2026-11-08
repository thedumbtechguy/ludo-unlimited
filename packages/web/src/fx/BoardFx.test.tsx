import { createGame, settingsFor, track, type GameState } from '@ludo/engine'
import { act, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createRef } from 'react'
import { BoardFx } from './BoardFx'
import { FxLayer } from './FxLayer'
import type { EffectEvent } from './stream'
import type { EffectsLevel } from '../types'

const area = createRef<HTMLElement>()
const settings = settingsFor('ghana', 4, 'firstWins')
const stateWith = (labourers: GameState['labourers'], edit?: (state: GameState) => void): GameState => {
  const state = { ...createGame(settings), labourers }
  edit?.(state)
  return state
}
const start: EffectEvent = { type: 'labourerStart', victim: 'green', owner: 'red', id: 1 }

type ScreenProps = { effects: EffectEvent[]; labourers: GameState['labourers']; state?: GameState; level?: EffectsLevel; enabled?: boolean }

function Screen({ effects, labourers, state = stateWith(labourers), level = 'full', enabled = true }: ScreenProps) {
  return (
    <FxLayer level={level} enabled={enabled}>
      <div className="board">
        <BoardFx effects={effects} state={state} turn={0} area={area} />
      </div>
    </FxLayer>
  )
}

describe('BoardFx chains', () => {
  it('shows faint chains on a Labourer’s yard that was already running, without slamming them', () => {
    render(<Screen effects={[]} labourers={{ green: 'red' }} />)
    expect(screen.getByTestId('chains-green')).toHaveClass('chains')
    expect(screen.getByTestId('chains-green')).not.toHaveClass('slam')
  })

  it('draws them in the colour of the player the victim works for', () => {
    render(<Screen effects={[]} labourers={{ green: 'blue' }} />)
    expect(screen.getByTestId('chains-green')).toHaveStyle({ color: '#3e63dd' })
  })

  it('slams them on when the Labourer starts, or fades them in with reduced effects', () => {
    const { rerender } = render(<Screen effects={[]} labourers={{}} />)
    rerender(<Screen effects={[start]} labourers={{ green: 'red' }} />)
    expect(screen.getByTestId('chains-green')).toHaveClass('slam')

    const reduced = render(<Screen effects={[]} labourers={{}} level="reduced" />)
    reduced.rerender(<Screen effects={[{ ...start, id: 2 }]} labourers={{ green: 'red' }} level="reduced" />)
    expect(reduced.container.querySelector('[data-testid="chains-green"]')).toHaveClass('fade')
  })

  it('takes them off when the victim is freed', () => {
    const { rerender } = render(<Screen effects={[]} labourers={{ green: 'red' }} />)
    rerender(<Screen effects={[{ type: 'labourerFreed', victim: 'green', id: 3 }]} labourers={{}} />)
    expect(screen.queryByTestId('chains-green')).toBeNull()
  })

  it('draws nothing with effects off', () => {
    render(<Screen effects={[]} labourers={{ green: 'red' }} enabled={false} />)
    expect(screen.queryByTestId('chains-green')).toBeNull()
  })
})

describe('BoardFx block shimmer', () => {
  afterEach(() => vi.useRealTimers())

  it('sweeps over the two stacked pieces of a new block, then goes', () => {
    vi.useFakeTimers()
    const block = (s: GameState) => {
      s.players[0].pieces[0] = track(5)
      s.players[0].pieces[1] = track(5)
    }
    const { rerender } = render(<Screen effects={[]} labourers={{}} />)
    rerender(<Screen effects={[{ type: 'blockFormed', color: 'red', at: track(5), id: 4 }]} labourers={{}} state={stateWith({}, block)} />)
    expect(screen.getByTestId('shimmer').querySelectorAll('circle')).toHaveLength(2)
    act(() => vi.advanceTimersByTime(700))
    expect(screen.queryByTestId('shimmer')).toBeNull()
  })
})
