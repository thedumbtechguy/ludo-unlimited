import { createGame, legalMoves, settingsFor, track } from '@ludo/engine'
import { describe, expect, it } from 'vitest'
import { realChoices } from './choices'

const game = () => createGame(settingsFor('ghana', 4, 'firstWins'))

describe('realChoices', () => {
  it('drops a combined forward move the single rolls reach anyway: 6 + 1 from base is one choice', () => {
    const state = { ...game(), pendingRoll: 6, queuedRolls: [1] }
    expect(legalMoves(state)).toHaveLength(2)
    expect(realChoices(legalMoves(state)).map((m) => m.kind)).toEqual(['enter'])
  })

  it('keeps a combined move that kicks: it is a different outcome', () => {
    const state = { ...game(), pendingRoll: 6, queuedRolls: [1] }
    state.players[2].pieces[0] = track(1)
    const kinds = realChoices(legalMoves(state)).map((m) => (m.rolls ? `${m.kind}+` : m.kind))
    expect(kinds).toContain('forward+')
  })

  it('keeps every choice when two pieces can move', () => {
    const state = { ...game(), pendingRoll: 6, queuedRolls: [1] }
    state.players[0].pieces[0] = track(10)
    expect(realChoices(legalMoves(state)).length).toBeGreaterThan(1)
  })
})
