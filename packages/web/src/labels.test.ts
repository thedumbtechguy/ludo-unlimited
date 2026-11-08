import { describe, expect, it } from 'vitest'
import { createGame, lane, settingsFor, track } from '@ludo/engine'
import { combinedRolls, describePosition, firstHuman, kickMessage, listNumbers, numberedTargetLabel, pieceLabel, placeName, seatNames, targetLabel, turnTag } from './labels'

describe('labels', () => {
  it('describes positions', () => {
    expect(describePosition({ kind: 'base' })).toBe('in base')
    expect(describePosition({ kind: 'home' })).toBe('home')
    expect(describePosition(track(8))).toBe('on square 9')
    expect(describePosition(lane('yellow', 2))).toBe("in Yellow's home lane, square 2")
  })

  it('labels pieces and targets', () => {
    expect(pieceLabel({ color: 'red', index: 0 }, track(8))).toBe('Red piece 1, on square 9')
    expect(targetLabel({ kind: 'forward', piece: { color: 'red', index: 0 }, to: track(8) })).toBe('Move on square 9')
    expect(
      targetLabel({ kind: 'forward', piece: { color: 'red', index: 0 }, to: track(8), kick: { color: 'yellow', index: 0 } }),
    ).toBe('Kick Yellow on square 9')
  })

  it('announces kicks by kind', () => {
    const piece = { color: 'red', index: 0 } as const
    const kick = { color: 'yellow', index: 0 } as const
    expect(kickMessage({ kind: 'line', piece, via: track(7), to: track(15), kick })).toBe('Red Line Kicked Yellow!')
    expect(kickMessage({ kind: 'forward', piece, to: track(8), kick })).toBe('Red kicked Yellow!')
    expect(kickMessage({ kind: 'forward', piece, to: track(8) })).toBeUndefined()
  })

  it('labels numbered targets and combined rolls', () => {
    const move = { kind: 'forward', piece: { color: 'red', index: 0 }, to: track(8), kick: { color: 'yellow', index: 0 }, rolls: 2 } as const
    const state = { ...createGame(settingsFor('classic', 2, 'firstWins')), pendingRoll: 6, queuedRolls: [4, 2] }
    expect(combinedRolls(state, move)).toBe('6+4')
    expect(combinedRolls(state, { ...move, rolls: undefined })).toBeUndefined()
    expect(numberedTargetLabel(1, move, '6+4')).toBe('Piece 1: Kick Yellow on square 9 using 6+4')
    expect(placeName(lane('yellow', 2))).toBe("Yellow's home lane, square 2")
    expect(listNumbers([1, 2, 3])).toBe('1, 2 and 3')
  })

  it('names seats: You for the first human, Player N for the next ones, Computer', () => {
    const colors = ['red', 'green', 'yellow', 'blue'] as const
    expect(seatNames({ red: 'computer', green: 'human', yellow: 'human', blue: 'human' }, [...colors])).toEqual({
      red: 'Computer',
      green: 'You',
      yellow: 'Player 2',
      blue: 'Player 3',
    })
    expect(seatNames({ red: 'human' }, ['red', 'yellow'])).toEqual({ red: 'You', yellow: 'Computer' })
    expect(firstHuman({ red: 'computer', yellow: 'human' }, ['red', 'yellow'])).toBe('yellow')
    expect(firstHuman({ red: 'computer' }, ['red', 'yellow'])).toBeUndefined()
  })

  it('tags the active yard', () => {
    expect(turnTag('red', 'red')).toBe('Your turn')
    expect(turnTag('green', 'red')).toBe("Green's turn")
    expect(turnTag('green', undefined)).toBe("Green's turn")
  })
})
