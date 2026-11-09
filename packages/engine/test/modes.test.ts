import { describe, expect, it } from 'vitest'
import { MODES, modeOfSettings, settingsFor } from '../src/modes'

describe('game modes', () => {
  it('classic has no house rules', () => {
    expect(MODES.classic).toEqual({
      rules: { backKick: false, lineKick: false, homeKick: false, labourer: false },
      afterKick: 'normal',
    })
  })

  it('ghana turns every kick and labourer on, with a normal after-kick', () => {
    expect(MODES.ghana).toEqual({
      rules: { backKick: true, lineKick: true, homeKick: true, labourer: true },
      afterKick: 'normal',
    })
  })

  it('builds full settings from a mode, players and end condition', () => {
    expect(settingsFor('ghana', 4, 'playForPlaces')).toEqual({
      players: 4,
      endCondition: 'playForPlaces',
      ...MODES.ghana,
    })
  })

  it('returns copies, so editing settings never changes the mode', () => {
    settingsFor('classic', 2, 'firstWins').rules.backKick = true
    expect(MODES.classic.rules.backKick).toBe(false)
  })
})

describe('modeOfSettings', () => {
  it('names the mode whose rules and after-kick match exactly', () => {
    expect(modeOfSettings(settingsFor('classic', 2, 'firstWins'))).toBe('classic')
    expect(modeOfSettings(settingsFor('ghana', 4, 'playForPlaces'))).toBe('ghana')
  })

  it('is undefined for rules chosen one by one, or another after-kick', () => {
    const custom = settingsFor('ghana', 4, 'firstWins')
    custom.rules.lineKick = false
    expect(modeOfSettings(custom)).toBeUndefined()
    expect(modeOfSettings({ ...settingsFor('ghana', 4, 'firstWins'), afterKick: 'bonusRoll' })).toBeUndefined()
  })
})
