import { replay, type GameEvent, type Settings } from '@ludo/engine'
import type { Seats } from './types'

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
