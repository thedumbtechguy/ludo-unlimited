import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { DiceButton } from './DiceButton'

const cube = (c: HTMLElement) => c.querySelector('.cube') as HTMLElement

describe('DiceButton', () => {
  it('renders a cube with six faces', () => {
    const { container } = render(<DiceButton disabled={false} onRoll={() => {}} />)
    expect(container.querySelectorAll('.face')).toHaveLength(6)
  })

  it('shows a faded six at rest before any roll', () => {
    const { container } = render(<DiceButton disabled={false} onRoll={() => {}} />)
    expect(screen.getByRole('button', { name: 'Roll dice' })).toBeInTheDocument()
    const six = container.querySelector('.face-6')!
    expect(six.querySelectorAll('.pip.on')).toHaveLength(6)
    expect(container.querySelectorAll('.pip.on:not(.faded)')).toHaveLength(0)
    expect(cube(container).style.transform).toContain('rotateY(180deg)')
  })

  it('turns the cube to the rolled value with solid pips', () => {
    const { container } = render(<DiceButton value={3} disabled={false} onRoll={() => {}} />)
    expect(cube(container).style.transform).toContain('rotateX(-90deg)')
    expect(container.querySelectorAll('.faded')).toHaveLength(0)
    expect(screen.getByRole('button')).toHaveAccessibleName('Roll dice (last roll 3)')
    expect(screen.getByRole('button')).not.toHaveClass('rolling')
  })

  it('has a rolling class and spins extra turns toward the result', () => {
    const { container } = render(<DiceButton value={2} rolling disabled onRoll={() => {}} />)
    expect(screen.getByRole('button')).toHaveClass('rolling')
    expect(cube(container).style.transform).toMatch(/rotateX\((360|720|1080)deg\)/)
  })
})
