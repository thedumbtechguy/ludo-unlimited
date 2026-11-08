export type Dice = () => number

export const randomDice: Dice = () => (crypto.getRandomValues(new Uint32Array(1))[0] % 6) + 1

export function fixedDice(values: number[]): Dice {
  let i = 0
  return () => values[i++ % values.length]
}

/** mulberry32: deterministic dice for tests and `?seed=` URLs. */
export function seededDice(seed: number): Dice {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return 1 + Math.floor((((t ^ (t >>> 14)) >>> 0) / 4294967296) * 6)
  }
}
