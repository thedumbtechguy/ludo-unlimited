import { describe, expect, it } from 'vitest'
import { createGame, lane, settingsFor, track } from '@ludo/engine'
import { combinedRolls, describePosition, finishCallout, firstHuman, kickCallouts, kickMessage, rulesName, listNumbers, numberedTargetLabel, pieceLabel, placeName, seatNames, targetLabel, turnTag, wastedText } from './labels'

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
    expect(turnTag('green', 'red', { red: 'Ama', green: 'Kofi' })).toBe("Kofi's turn")
    expect(turnTag('red', 'red', { red: 'Ama' })).toBe('Your turn')
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
      expect(kickCallouts({ kind: 'forward', piece, to: track(13), kick }, before())).toEqual([{ title: 'Kick!', line }])
      expect(kickCallouts({ kind: 'enter', piece, to: track(0), kick }, before({ kind: 'base' }))).toEqual([{ title: 'Kick!', line }])
      expect(kickCallouts({ kind: 'back', piece, to: track(7), kick }, before())).toEqual([{ title: 'Back kick!', line }])
      expect(kickCallouts({ kind: 'line', piece, via: track(7), to: track(15), kick }, before())).toEqual([{ title: 'Line kick!', line }])
      expect(kickCallouts({ kind: 'homeKick', piece, to: track(3), kick }, before())).toEqual([{ title: 'Home kick!', line }])
    })

    it('calls the kick first, then "Wicked!" for a kick that takes the piece round past its own entrance', () => {
      expect(kickCallouts({ kind: 'back', piece, to: track(0), kick }, before(lane('red', 4)))).toEqual([
        { title: 'Back kick!', line },
        { title: 'Wicked!', line, wicked: true },
      ])
      expect(kickCallouts({ kind: 'line', piece, via: track(46), to: track(2), kick }, before(track(44))).map((c) => c.title)).toEqual([
        'Line kick!',
        'Wicked!',
      ])
    })

    it('backing out of the lane along the arm is just a back kick', () => {
      expect(kickCallouts({ kind: 'back', piece, to: track(49), kick }, before(lane('red', 2)))).toEqual([{ title: 'Back kick!', line }])
    })

    it('has nothing to say about a move without a kick', () => {
      expect(kickCallouts({ kind: 'forward', piece, to: track(13) }, before())).toEqual([])
    })
  })

  it('says whose roll had no move', () => {
    expect(wastedText({ color: 'red', value: 4 }, 'red')).toBe('No move with your 4')
    expect(wastedText({ color: 'green', value: 4 }, 'red')).toBe('Green had no move with a 4')
  })
})

describe('finishCallout', () => {
  const game = (endCondition: 'firstWins' | 'playForPlaces', status: 'playing' | 'finished') => ({
    ...createGame(settingsFor('ghana', 4, endCondition)),
    status,
  })
  const finished = (color: 'red' | 'green' | 'yellow' | 'blue', place: number) => ({ type: 'playerFinished' as const, color, place })

  it('says nothing for a move that finishes no one', () => {
    expect(finishCallout([{ type: 'pieceHome', piece: { color: 'red', index: 0 } }], game('firstWins', 'playing'))).toBeUndefined()
  })

  it('calls the win, and that the game is over, when the first home wins', () => {
    expect(finishCallout([finished('red', 1), { type: 'gameOver' }], game('firstWins', 'finished'))).toMatchObject({
      title: 'Red wins!',
      line: 'All four pieces home',
      color: 'red',
      win: true,
    })
  })

  it('says "You" for the first human seat', () => {
    expect(finishCallout([finished('red', 1)], game('firstWins', 'finished'), 'red')?.title).toBe('You win!')
    expect(finishCallout([finished('green', 2)], game('playForPlaces', 'playing'), 'green')?.title).toBe('You come 2nd!')
  })

  it('when play goes on for places, says which place is next', () => {
    expect(finishCallout([finished('blue', 1)], game('playForPlaces', 'playing'))).toMatchObject({
      title: 'Blue wins!',
      line: 'Play goes on for 2nd place',
      win: true,
    })
    expect(finishCallout([finished('green', 2)], game('playForPlaces', 'playing'))).toMatchObject({
      title: 'Green comes 2nd!',
      line: 'Play goes on for 3rd place',
      win: false,
    })
  })

  it('when the places are settled, names who came last too', () => {
    expect(finishCallout([finished('green', 3), finished('red', 4), { type: 'gameOver' }], game('playForPlaces', 'finished'), 'red')).toMatchObject({
      title: 'Green comes 3rd!',
      line: 'You come 4th',
    })
  })

  it('the win stays up longer than a later place', () => {
    const win = finishCallout([finished('red', 1)], game('playForPlaces', 'playing'))!
    const second = finishCallout([finished('red', 2)], game('playForPlaces', 'playing'))!
    expect(win.ms).toBeGreaterThan(second.ms!)
  })
})
