import { replay, type GameEvent, type ModeName, type Settings } from '@ludo/engine'
import type { EffectsLevel, Hand, Seats, ThemePref } from './types'

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
    return { ...saved, seats: upgradeSeats(saved.seats) }
  } catch {
    return undefined
  }
}

/** Games saved before there were levels have plain 'computer' seats: that bot is now Hard. */
function upgradeSeats(seats: Record<string, string>): Seats {
  return Object.fromEntries(Object.entries(seats).map(([color, seat]) => [color, seat === 'computer' ? 'hard' : seat])) as Seats
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

const THEME_KEY = 'ludo-unlimited:theme'

/** The stored theme choice, else follow the system. index.html reads the same key before first paint. */
export function loadTheme(): ThemePref {
  try {
    const stored = localStorage.getItem(THEME_KEY)
    if (stored === 'light' || stored === 'dark') return stored
  } catch {
    // Storage blocked: follow the system.
  }
  return 'system'
}

export function saveTheme(theme: ThemePref): void {
  try {
    localStorage.setItem(THEME_KEY, theme)
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

const DEVICE_KEY = 'ludo-unlimited:device'
const NAME_KEY = 'ludo-unlimited:name'
let sessionDevice: string | undefined

/** This device's random ID, which lets a room recognise it on return. Made once and kept. */
export function loadDevice(): string {
  try {
    const stored = localStorage.getItem(DEVICE_KEY)
    if (stored) return stored
    const id = crypto.randomUUID()
    localStorage.setItem(DEVICE_KEY, id)
    return id
  } catch {
    // Storage blocked: an ID for as long as the page is open.
    return (sessionDevice ??= crypto.randomUUID())
  }
}

export function loadName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? ''
  } catch {
    return ''
  }
}

export function saveName(name: string): void {
  try {
    localStorage.setItem(NAME_KEY, name)
  } catch {
    // The name just won't be remembered.
  }
}

const QUICK_MODE_KEY = 'ludo-unlimited:quick-mode'

/** The rules last picked for quick match: Ghana kicks unless Classic was. */
export function loadQuickMode(): ModeName {
  try {
    return localStorage.getItem(QUICK_MODE_KEY) === 'classic' ? 'classic' : 'ghana'
  } catch {
    return 'ghana'
  }
}

export function saveQuickMode(mode: ModeName): void {
  try {
    localStorage.setItem(QUICK_MODE_KEY, mode)
  } catch {
    // Storage blocked: the pick lasts until the page closes.
  }
}
