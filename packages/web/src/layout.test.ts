import { createGame, lane, settingsFor, startIndex, track, TRACK } from '@ludo/engine'
import { describe, expect, it } from 'vitest'
import { TILES, boardToScreen, placements, positionPoint, quarterTurns, turnPoint, viewerOf } from './layout'

const red0 = { color: 'red', index: 0 } as const

describe('layout', () => {
  it('has 72 path tiles; only the 4 start squares on the track are coloured', () => {
    expect(TILES).toHaveLength(72)
    const trackTiles = TILES.slice(0, TRACK.length)
    expect(trackTiles.filter((t) => t.fill !== null)).toHaveLength(4)
    expect(trackTiles[startIndex('green')].fill).toBe('green')
  })

  it('places positions on the 40px grid', () => {
    expect(positionPoint(track(0), red0)).toEqual({ x: 60, y: 260 })
    expect(positionPoint(lane('red', 1), red0)).toEqual({ x: 60, y: 300 })
    expect(positionPoint({ kind: 'base' }, red0)).toEqual({ x: 80, y: 80 })
    expect(positionPoint({ kind: 'base' }, { color: 'green', index: 3 })).toEqual({ x: 520, y: 160 })
    expect(positionPoint({ kind: 'home' }, { color: 'yellow', index: 0 })).toEqual({ x: 330, y: 300 })
  })

  it('places every piece, fanning out stacks', () => {
    const state = createGame(settingsFor('classic', 4, 'firstWins'))
    expect(placements(state)).toHaveLength(16)
    state.players[0].pieces[0] = track(5)
    state.players[0].pieces[1] = track(5)
    const stacked = placements(state).filter((p) => p.piece.color === 'red' && p.piece.index < 2)
    expect(stacked.map((p) => p.stack)).toEqual([2, 2])
    expect(stacked[0].point).not.toEqual(stacked[1].point)
  })

  it('puts the lowest-index piece of a stack on top', () => {
    const state = createGame(settingsFor('classic', 4, 'firstWins'))
    state.players[0].pieces[0] = track(5)
    state.players[0].pieces[1] = track(5)
    const stacked = placements(state).filter((p) => p.piece.color === 'red' && p.piece.index < 2)
    expect(stacked.find((p) => p.top)?.piece.index).toBe(0)
    expect(stacked[stacked.length - 1].piece.index).toBe(0)
  })

  it('draws a moving piece where the animation says', () => {
    const state = createGame(settingsFor('classic', 2, 'firstWins'))
    const moved = placements(state, { piece: red0, at: track(0) }).find((p) => p.piece.color === 'red' && p.piece.index === 0)
    expect(moved?.point).toEqual({ x: 60, y: 260 })
  })

  describe('orientation', () => {
    it('turns points clockwise a quarter at a time around the centre', () => {
      expect(turnPoint({ x: 60, y: 260 }, 0)).toEqual({ x: 60, y: 260 })
      expect(turnPoint({ x: 60, y: 260 }, 1)).toEqual({ x: 340, y: 60 })
      expect(turnPoint({ x: 60, y: 260 }, 2)).toEqual({ x: 540, y: 340 })
      expect(turnPoint({ x: 300, y: 300 }, 3)).toEqual({ x: 300, y: 300 })
    })

    it('right hand puts the viewer’s yard bottom-right', () => {
      for (const [viewer, yard] of [
        ['red', { x: 120, y: 120 }],
        ['green', { x: 480, y: 120 }],
        ['yellow', { x: 480, y: 480 }],
        ['blue', { x: 120, y: 480 }],
      ] as const) {
        expect(turnPoint(yard, quarterTurns(viewer, 'right'))).toEqual({ x: 480, y: 480 })
      }
    })

    it('left hand puts the viewer’s yard bottom-left', () => {
      for (const [viewer, yard] of [
        ['red', { x: 120, y: 120 }],
        ['green', { x: 480, y: 120 }],
        ['yellow', { x: 480, y: 480 }],
        ['blue', { x: 120, y: 480 }],
      ] as const) {
        expect(turnPoint(yard, quarterTurns(viewer, 'left'))).toEqual({ x: 120, y: 480 })
      }
    })

    it('the viewer is the first human seat, or red with no humans', () => {
      expect(viewerOf({ red: 'computer', green: 'human', yellow: 'human' }, ['red', 'green', 'yellow'])).toBe('green')
      expect(viewerOf({ red: 'computer', yellow: 'computer' }, ['red', 'yellow'])).toBe('red')
      expect(viewerOf({}, ['red', 'yellow'])).toBe('red')
    })
  })

  describe('boardToScreen', () => {
    const rect = { left: 16, top: 100, width: 300, height: 300 }

    it('scales a board point into the board’s rect', () => {
      expect(boardToScreen({ x: 300, y: 300 }, rect, 0)).toEqual({ x: 166, y: 250 })
      expect(boardToScreen({ x: 0, y: 0 }, rect, 0)).toEqual({ x: 16, y: 100 })
    })

    it('turns with the board, so red’s yard follows it to the bottom-right', () => {
      const yard = { x: 120, y: 120 }
      const turns = quarterTurns('red', 'right')
      expect(boardToScreen(yard, rect, turns)).toEqual({ x: 16 + 240, y: 100 + 240 })
      expect(boardToScreen(yard, rect, quarterTurns('red', 'left'))).toEqual({ x: 16 + 60, y: 100 + 240 })
    })
  })
})
