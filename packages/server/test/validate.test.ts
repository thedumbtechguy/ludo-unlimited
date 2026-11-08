import { settingsFor } from '@ludo/engine'
import { describe, expect, it } from 'vitest'
import { CODE_ALPHABET, cleanName, cleanSettings, makeCode, validSettings, validTimer } from '../src/validate'

describe('cleanName', () => {
  it('trims, collapses spaces and keeps 16 characters', () => {
    expect(cleanName('  Kofi   Mensah ')).toBe('Kofi Mensah')
    expect(cleanName('A'.repeat(30))).toBe('A'.repeat(16))
  })
  it('refuses an empty name', () => {
    expect(cleanName('   ')).toBeUndefined()
    expect(cleanName(42)).toBeUndefined()
  })
  it('drops control and invisible characters', () => {
    expect(cleanName('Ko\u200bfi\u202e')).toBe('Kofi')
    expect(cleanName('\u0007Ama\n')).toBe('Ama')
    expect(cleanName('\u200b\u200d\u2066')).toBeUndefined()
  })
})

describe('cleanSettings', () => {
  it('keeps only the known fields', () => {
    const settings = settingsFor('ghana', 4, 'firstWins')
    const messy = { ...settings, junk: 'x'.repeat(100), rules: { ...settings.rules, extra: true } }
    expect(cleanSettings(messy)).toEqual(settings)
  })
})

describe('validSettings', () => {
  it('accepts engine settings', () => {
    expect(validSettings(settingsFor('ghana', 4, 'firstWins'))).toBe(true)
    expect(validSettings(settingsFor('classic', 2, 'playForPlaces'))).toBe(true)
  })
  it('rejects anything else', () => {
    expect(validSettings({ ...settingsFor('ghana', 4, 'firstWins'), players: 5 })).toBe(false)
    expect(validSettings({ ...settingsFor('ghana', 4, 'firstWins'), afterKick: 'explode' })).toBe(false)
    expect(validSettings({ ...settingsFor('ghana', 4, 'firstWins'), rules: { backKick: 'yes' } })).toBe(false)
    expect(validSettings(null)).toBe(false)
  })
})

describe('validTimer', () => {
  it('knows the four timers', () => {
    for (const t of ['relaxed', 'normal', 'quick', 'off']) expect(validTimer(t)).toBe(true)
    expect(validTimer('slow')).toBe(false)
  })
})

describe('makeCode', () => {
  it('makes 4 letters with no look-alikes', () => {
    expect(CODE_ALPHABET).not.toMatch(/[ILO01]/)
    const values = [0, 0.5, 0.99, 0.25]
    let i = 0
    const code = makeCode(() => values[i++])
    expect(code).toMatch(new RegExp(`^[${CODE_ALPHABET}]{4}$`))
  })
})
