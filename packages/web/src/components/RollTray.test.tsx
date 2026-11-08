import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { RollTray } from './RollTray'

const chips = () => screen.getAllByRole('listitem')
const pips = (chip: HTMLElement) => chip.querySelectorAll('.chip-pip.on').length

describe('RollTray', () => {
  it('shows each roll as a die face with pips, never digits', () => {
    render(<RollTray rolls={[6, 3]} />)
    expect(chips().map(pips)).toEqual([6, 3])
    for (const chip of chips()) {
      expect(chip.querySelector('[aria-hidden="true"]')!.textContent).toBe('')
      expect(chip.querySelectorAll('.chip-pip')).toHaveLength(9)
    }
  })

  it('shows the queued 6s while rolling, none of them current', () => {
    render(<RollTray rolls={[6, 6]} />)
    expect(chips().map((el) => el.textContent)).toEqual(['6', '6'])
    expect(document.querySelectorAll('.chip.now')).toHaveLength(0)
  })

  it('marks the roll being played now, for sight and for screen readers', () => {
    render(<RollTray rolls={[6, 4]} current={0} />)
    expect(chips()[0]).toHaveClass('now')
    expect(chips()[0]).toHaveTextContent('6, playing now')
    expect(chips()[1]).not.toHaveClass('now')
    expect(chips()[1]).toHaveTextContent(/^4$/)
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
