import { HOME, track, type GameEffect, type KickKind } from '@ludo/engine'
import { fireEvent } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { audio } from './audio'
import { crackleVolume, ducksMusic, listenForTaps, playSound, SFX, SOUNDS, soundsFor } from './sound'

const red0 = { color: 'red', index: 0 } as const
const yellow0 = { color: 'yellow', index: 0 } as const
const kick = (kind: KickKind): GameEffect => ({ type: 'kick', kind, at: track(9), kicker: red0, victim: yellow0 })

describe('soundsFor', () => {
  it('rattles the dice, then clacks it down', () => {
    expect(soundsFor({ type: 'roll' })).toEqual(['dice-rattle'])
    expect(soundsFor({ type: 'diceLanded' })).toEqual(['dice-land'])
  })

  it('ticks each square, clicks on the last, and pops a piece out of its yard', () => {
    expect(soundsFor({ type: 'pieceStep', entered: false, last: false })).toEqual(['step'])
    expect(soundsFor({ type: 'pieceStep', entered: false, last: true })).toEqual(['land'])
    expect(soundsFor({ type: 'pieceStep', entered: true, last: false })).toEqual(['enter'])
    expect(soundsFor({ type: 'pieceStep', entered: true, last: true })).toEqual(['enter'])
  })

  it('hits on every kick, adds the kind’s own sound, and whooshes the victim home', () => {
    expect(soundsFor(kick('front'))).toEqual(['kick', 'whoosh'])
    expect(soundsFor(kick('back'))).toEqual(['kick', 'whoosh'])
    expect(soundsFor(kick('line'))).toEqual(['kick', 'zap', 'whoosh'])
    expect(soundsFor(kick('home'))).toEqual(['kick', 'thud', 'whoosh'])
    expect(soundsFor(kick('wicked'))).toEqual(['kick', 'wicked', 'whoosh'])
  })

  it('whooshes once when "On fire" appears, at the fourth 6', () => {
    const six = (count: number): GameEffect => ({ type: 'sixStreak', color: 'red', count })
    expect([1, 2, 3, 4, 5, 6].map((n) => soundsFor(six(n)))).toEqual([[], [], [], ['on-fire'], [], []])
    expect(soundsFor({ type: 'streakEnded', color: 'red', count: 4 })).toEqual([])
  })

  it('clanks the Labourer’s chains on and shatters them when freed', () => {
    expect(soundsFor({ type: 'labourerStart', victim: 'yellow', owner: 'red' })).toEqual(['chains'])
    expect(soundsFor({ type: 'labourerFreed', victim: 'yellow' })).toEqual(['shatter'])
  })

  it('chimes a piece home and plays the fanfare at the end', () => {
    expect(soundsFor({ type: 'pieceHome', piece: red0 })).toEqual(['home'])
    expect(soundsFor({ type: 'gameOver' })).toEqual(['fanfare'])
  })

  it('is quiet for the rest', () => {
    expect(soundsFor({ type: 'blockFormed', color: 'red', at: HOME })).toEqual([])
    expect(soundsFor({ type: 'playerFinished', color: 'red', place: 1 })).toEqual([])
  })

  it('taps for a button', () => {
    expect(soundsFor({ type: 'tap' })).toEqual(['tap'])
  })

  it('names only sounds there are files for', () => {
    expect(SFX).toEqual([...Object.keys(SOUNDS), 'fire-crackle'])
  })
})

describe('ducksMusic', () => {
  it('dips the music for kicks, "On fire" and the end of the game only', () => {
    expect(ducksMusic(kick('front'))).toBe(true)
    expect(ducksMusic(kick('wicked'))).toBe(true)
    expect(ducksMusic({ type: 'gameOver' })).toBe(true)
    expect(ducksMusic({ type: 'sixStreak', color: 'red', count: 4 })).toBe(true)
    expect(ducksMusic({ type: 'sixStreak', color: 'red', count: 5 })).toBe(false)
    expect(ducksMusic({ type: 'pieceHome', piece: red0 })).toBe(false)
    expect(ducksMusic({ type: 'pieceStep', entered: false, last: true })).toBe(false)
  })
})

describe('crackleVolume', () => {
  it('is silent for a single 6 and grows with the streak, to a cap', () => {
    const volumes = [0, 1, 2, 3, 4, 5, 6, 20].map(crackleVolume)
    expect(volumes.slice(0, 2)).toEqual([0, 0])
    for (let i = 2; i < volumes.length; i++) expect(volumes[i]).toBeGreaterThanOrEqual(volumes[i - 1])
    expect(volumes[2]).toBeGreaterThan(0)
    expect(volumes.at(-1)).toBe(0.5)
  })
})

describe('playSound', () => {
  afterEach(() => vi.restoreAllMocks())

  it('plays each of the moment’s sounds at its own volume, ducking the music for big ones', () => {
    const play = vi.spyOn(audio, 'play')
    const duck = vi.spyOn(audio, 'duck')
    playSound(kick('line'))
    expect(play.mock.calls).toEqual([
      ['kick', SOUNDS.kick],
      ['zap', SOUNDS.zap],
      ['whoosh', SOUNDS.whoosh],
    ])
    expect(duck).toHaveBeenCalledTimes(1)
    playSound({ type: 'pieceHome', piece: red0 })
    expect(duck).toHaveBeenCalledTimes(1)
  })

  it('taps for buttons but not for the board', () => {
    const play = vi.spyOn(audio, 'play')
    const stop = listenForTaps()
    document.body.innerHTML = '<button class="primary">Roll again</button><button class="sheet-row">Sound: On</button><svg><g role="button" class="piece"></g></svg><button class="dice">Roll</button>'
    fireEvent.click(document.querySelector('.primary')!)
    fireEvent.click(document.querySelector('.sheet-row')!)
    fireEvent.click(document.querySelector('.piece')!)
    fireEvent.click(document.querySelector('.dice')!)
    stop()
    fireEvent.click(document.querySelector('.primary')!)
    expect(play.mock.calls.map(([id]) => id)).toEqual(['tap', 'tap'])
    document.body.innerHTML = ''
  })
})
