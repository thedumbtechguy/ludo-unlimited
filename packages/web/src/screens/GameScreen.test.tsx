import { createGame, settingsFor, track } from '@ludo/engine'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { fixedDice } from '../dice'
import { FAST_TIMING } from '../useGame'
import { GameScreen } from './GameScreen'

const settings = settingsFor('classic', 2, 'firstWins')
const noop = () => {}
const yard = (color: string) => screen.getAllByTestId('yard').find((el) => el.getAttribute('data-color') === color)!
const corner = (color: string) => [yard(color).getAttribute('x'), yard(color).getAttribute('y')]

describe('GameScreen banner', () => {
  it('says whose turn it is on the main line, with an empty but present detail line', () => {
    render(<GameScreen options={{ settings, seats: { red: 'human', yellow: 'human' }, dice: fixedDice([3]), timing: FAST_TIMING }} onFinish={noop} onQuit={noop} hand="right" />)
    expect(screen.getByText('Red to roll')).toHaveClass('banner-main')
    expect(document.querySelector('.banner-detail')).toHaveTextContent('')
  })

  it('names a computer seat on the detail line', () => {
    render(<GameScreen options={{ settings, seats: { red: 'computer', yellow: 'human' }, dice: fixedDice([3]), timing: { ...FAST_TIMING, botRoll: 60_000 } }} onFinish={noop} onQuit={noop} hand="right" />)
    expect(screen.getByText('Computer playing')).toHaveClass('banner-detail')
  })

  it('a Labourer owner moves with the victim’s roll: mover on top, whose roll below', () => {
    const initial = { ...createGame(settings), turn: 'yellow' as const, labourers: { yellow: 'red' as const }, pendingRoll: 3 }
    initial.players[0].pieces = [track(5), track(20), initial.players[0].pieces[2], initial.players[0].pieces[3]]
    render(<GameScreen options={{ settings, seats: { red: 'human', yellow: 'human' }, dice: fixedDice([3]), timing: FAST_TIMING, initial }} onFinish={noop} onQuit={noop} hand="right" />)
    expect(screen.getByText('Red to move')).toHaveClass('banner-main')
    expect(screen.getByText("with Yellow's roll (Labourer)")).toHaveClass('banner-detail')
  })
})

describe('GameScreen board', () => {
  const seats = { red: 'computer', yellow: 'human' } as const
  const options = { settings, seats, dice: fixedDice([3]), timing: { ...FAST_TIMING, botRoll: 60_000 } }

  it('turns the first human’s yard bottom-right for a right hand', () => {
    render(<GameScreen options={options} hand="right" onFinish={noop} onQuit={noop} />)
    expect(corner('yellow')).toEqual(['364', '364'])
  })

  it('turns the first human’s yard bottom-left for a left hand', () => {
    render(<GameScreen options={options} hand="left" onFinish={noop} onQuit={noop} />)
    expect(corner('yellow')).toEqual(['4', '364'])
  })

  it('turns red towards the viewer when nobody is human', () => {
    render(<GameScreen options={{ ...options, seats: { red: 'computer', yellow: 'computer' } }} hand="left" onFinish={noop} onQuit={noop} />)
    expect(corner('red')).toEqual(['4', '364'])
  })

  it('paints the players on their yards and tags whose turn it is', () => {
    render(<GameScreen options={options} hand="right" onFinish={noop} onQuit={noop} />)
    expect(screen.getByTestId('yard-label-yellow')).toHaveTextContent('You0 home')
    expect(screen.getByTestId('yard-label-red')).toHaveTextContent("ComputerRed's turn")
  })
})
