import { describe, expect, it } from 'vitest'
import { fixedDice, randomDice, seededDice } from './dice'

describe('dice', () => {
  it('random dice roll 1 to 6', () => {
    const rolls = Array.from({ length: 600 }, randomDice)
    expect(rolls.every((r) => r >= 1 && r <= 6 && Number.isInteger(r))).toBe(true)
    expect(new Set(rolls).size).toBe(6)
  })

  it('fixed dice cycle through their values', () => {
    const dice = fixedDice([6, 2])
    expect([dice(), dice(), dice()]).toEqual([6, 2, 6])
  })

  it('seeded dice repeat for the same seed', () => {
    const a = seededDice(7)
    const b = seededDice(7)
    const rollsA = Array.from({ length: 20 }, a)
    expect(Array.from({ length: 20 }, b)).toEqual(rollsA)
    expect(rollsA.every((r) => r >= 1 && r <= 6)).toBe(true)
  })
})
