import { describe, expect, it } from 'vitest'
import { CHAIN_REACH, chainLinks, LINK_PITCH } from './chains'

describe('Labourer chains', () => {
  const centre = { x: 120, y: 120 }
  const links = chainLinks(centre)

  it('two chains cross at the yard’s centre, one each way, links alternating face on and edge on', () => {
    const [down, up] = [links.filter((l) => l.angle === 45), links.filter((l) => l.angle === -45)]
    expect(down.length).toBe(up.length)
    expect(down.length % 2).toBe(1)
    const mid = (down.length - 1) / 2
    expect(down[mid]).toMatchObject({ x: 120, y: 120, flat: true })
    expect(down.slice(mid - 1, mid + 2).map((l) => l.flat)).toEqual([false, true, false])
  })

  it('stays within the yard’s reach, links evenly spaced', () => {
    for (const { x, y } of links) {
      expect(Math.abs(x - centre.x)).toBeLessThanOrEqual(CHAIN_REACH)
      expect(Math.abs(y - centre.y)).toBeLessThanOrEqual(CHAIN_REACH)
    }
    const [a, b] = links
    expect(Math.hypot(b.x - a.x, b.y - a.y)).toBeCloseTo(LINK_PITCH)
  })
})
