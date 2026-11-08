import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { RollTray } from './RollTray'

const chips = () => screen.getAllByRole('listitem')

describe('RollTray', () => {
  it('shows the queued 6s while rolling, none of them current', () => {
    render(<RollTray rolls={[6, 6]} />)
    expect(chips().map((el) => el.textContent)).toEqual(['6', '6'])
    expect(document.querySelectorAll('.chip.now')).toHaveLength(0)
  })

  it('marks the roll being played as now', () => {
    render(<RollTray rolls={[6, 4]} current={0} />)
    expect(chips()[0]).toHaveClass('now')
    expect(chips()[0]).toHaveTextContent('6, now')
    expect(chips()[1]).not.toHaveClass('now')
  })

  it('highlights every roll a previewed combined move would use', () => {
    render(<RollTray rolls={[6, 6, 3]} current={0} using={2} />)
    expect(chips().map((el) => el.classList.contains('using'))).toEqual([true, true, false])
  })

  it('renders an empty tray without chips', () => {
    render(<RollTray rolls={[]} />)
    expect(screen.queryAllByRole('listitem')).toHaveLength(0)
  })
})
