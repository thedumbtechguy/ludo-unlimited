import { createGame, lane, settingsFor, startIndex, track, TRACK } from '@ludo/engine'
import { describe, expect, it } from 'vitest'
import { TILES, placements, positionPoint } from './layout'

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

  it('draws a moving piece where the animation says', () => {
    const state = createGame(settingsFor('classic', 2, 'firstWins'))
    const moved = placements(state, { piece: red0, at: track(0) }).find((p) => p.piece.color === 'red' && p.piece.index === 0)
    expect(moved?.point).toEqual({ x: 60, y: 260 })
  })
})
