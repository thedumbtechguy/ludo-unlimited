import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { createRef } from 'react'
import { BoardFx } from './BoardFx'
import { FxLayer } from './FxLayer'
import type { EffectEvent } from './stream'
import type { EffectsLevel } from '../types'

const area = createRef<HTMLElement>()
const start: EffectEvent = { type: 'labourerStart', victim: 'green', owner: 'red', id: 1 }

function Screen({ effects, labourers, level = 'full', enabled = true }: { effects: EffectEvent[]; labourers: Record<string, string>; level?: EffectsLevel; enabled?: boolean }) {
  return (
    <FxLayer level={level} enabled={enabled}>
      <div className="board">
        <BoardFx effects={effects} labourers={labourers} turn={0} area={area} />
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
