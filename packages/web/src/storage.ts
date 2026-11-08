import { replay, type GameEvent, type Settings } from '@ludo/engine'
import type { EffectsLevel, Hand, Seats } from './types'

export type SavedGame = { settings: Settings; seats: Seats; log: GameEvent[] }

const KEY = 'ludo-unlimited:game'

export function saveGame(saved: SavedGame): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(saved))
  } catch {
    // Storage blocked or full: the game still plays, it just can't be resumed.
  }
}

/** The saved game, if there is one and its log still replays. */
export function loadGame(): SavedGame | undefined {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return undefined
    const saved = JSON.parse(raw) as SavedGame
    replay(saved.settings, saved.log)
    return saved
  } catch {
    return undefined
  }
}

export function clearGame(): void {
  try {
    localStorage.removeItem(KEY)
  } catch {
    // Nothing to clear when storage is blocked.
  }
}

const HAND_KEY = 'ludo-unlimited:hand'

export function loadHand(): Hand {
  try {
    return localStorage.getItem(HAND_KEY) === 'left' ? 'left' : 'right'
  } catch {
    return 'right'
  }
}

export function saveHand(hand: Hand): void {
  try {
    localStorage.setItem(HAND_KEY, hand)
  } catch {
    // Storage blocked: the choice lasts until the page closes.
  }
}

const EFFECTS_KEY = 'ludo-unlimited:effects'

/** The stored choice, else reduced when the device asks for reduced motion. */
export function loadEffects(): EffectsLevel {
  try {
    const stored = localStorage.getItem(EFFECTS_KEY)
    if (stored === 'full' || stored === 'reduced') return stored
  } catch {
    // Storage blocked: fall back to the device setting.
  }
  return matchMedia('(prefers-reduced-motion: reduce)').matches ? 'reduced' : 'full'
}

export function saveEffects(level: EffectsLevel): void {
  try {
    localStorage.setItem(EFFECTS_KEY, level)
  } catch {
    // Storage blocked: the choice lasts until the page closes.
  }
}

const SOUND_KEY = 'ludo-unlimited:sound'
const MUSIC_KEY = 'ludo-unlimited:music'

/** Sound effects, on unless switched off on this device. */
export const loadSound = (): boolean => loadSwitch(SOUND_KEY)
export const saveSound = (on: boolean): void => saveSwitch(SOUND_KEY, on)
/** Background music, on unless switched off on this device. */
export const loadMusic = (): boolean => loadSwitch(MUSIC_KEY)
export const saveMusic = (on: boolean): void => saveSwitch(MUSIC_KEY, on)

function loadSwitch(key: string): boolean {
  try {
    return localStorage.getItem(key) !== 'off'
  } catch {
    return true
  }
}

function saveSwitch(key: string, on: boolean): void {
  try {
    localStorage.setItem(key, on ? 'on' : 'off')
  } catch {
    // Storage blocked: the choice lasts until the page closes.
  }
}
