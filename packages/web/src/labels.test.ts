import { describe, expect, it } from 'vitest'
import { createGame, lane, settingsFor, track } from '@ludo/engine'
import { combinedRolls, describePosition, firstHuman, kickCallout, kickMessage, rulesName, listNumbers, numberedTargetLabel, pieceLabel, placeName, seatNames, targetLabel, turnTag } from './labels'

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

  it('names the rules', () => {
    const plain = { backKick: false, lineKick: false, homeKick: false, labourer: false }
    expect(rulesName({ backKick: true, lineKick: true, homeKick: true, labourer: true })).toBe('Ghana rules')
    expect(rulesName(plain)).toBe('Classic rules')
    expect(rulesName({ ...plain, lineKick: true })).toBe('Custom rules')
  })

  describe('kick callouts', () => {
    const piece = { color: 'red', index: 0 } as const
    const kick = { color: 'yellow', index: 0 } as const
    const before = (pos = track(10)) => {
      const state = createGame(settingsFor('ghana', 2, 'firstWins'))
      state.players[0].pieces[0] = pos
      return state
    }
    const line = 'Red sent Yellow back to base'

    it('names each kind of kick', () => {
      expect(kickCallout({ kind: 'forward', piece, to: track(13), kick }, before())).toEqual({ title: 'Kick!', line })
      expect(kickCallout({ kind: 'enter', piece, to: track(0), kick }, before({ kind: 'base' }))).toEqual({ title: 'Kick!', line })
      expect(kickCallout({ kind: 'back', piece, to: track(7), kick }, before())).toEqual({ title: 'Back kick!', line })
      expect(kickCallout({ kind: 'line', piece, via: track(7), to: track(15), kick }, before())).toEqual({ title: 'Line kick!', line })
      expect(kickCallout({ kind: 'homeKick', piece, to: track(3), kick }, before())).toEqual({ title: 'Home kick!', line })
    })

    it('calls a back kick out of the player’s own home lane wicked', () => {
      expect(kickCallout({ kind: 'back', piece, to: track(49), kick }, before(lane('red', 2)))).toEqual({ title: 'Wicked!', line })
      // Out of someone else's lane, it's an ordinary back kick.
      expect(kickCallout({ kind: 'back', piece, to: track(49), kick }, before(lane('yellow', 2)))?.title).toBe('Back kick!')
    })

    it('has nothing to say about a move without a kick', () => {
      expect(kickCallout({ kind: 'forward', piece, to: track(13) }, before())).toBeUndefined()
    })
  })
})
