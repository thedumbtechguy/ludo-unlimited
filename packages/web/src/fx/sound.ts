import type { GameEffect, KickKind } from '@ludo/engine'
import { audio, type Sound } from './audio'

/** Every one-shot sound, by its file name under `public/audio`. Dice and kicks are loudest; steps are quiet. */
export const SOUNDS = {
  'dice-rattle': { volume: 0.55, vary: 0.04 },
  'dice-land': { volume: 0.8, vary: 0.05 },
  step: { volume: 0.12, vary: 0.08 },
  land: { volume: 0.4, vary: 0.05 },
  enter: { volume: 0.45, vary: 0.04 },
  kick: { volume: 0.85 },
  zap: { volume: 0.35 },
  thud: { volume: 0.7 },
  wicked: { volume: 0.75 },
  whoosh: { volume: 0.35, vary: 0.06 },
  'on-fire': { volume: 0.6 },
  chains: { volume: 0.5 },
  shatter: { volume: 0.5 },
  home: { volume: 0.35 },
  fanfare: { volume: 0.5 },
  tap: { volume: 0.2, vary: 0.06 },
} satisfies Record<string, Sound>

export type SoundId = keyof typeof SOUNDS

/** The fire's looping crackle, apart from the one-shots. */
export const CRACKLE = 'fire-crackle'

/** Everything the game screen loads ahead. */
export const SFX: readonly string[] = [...Object.keys(SOUNDS), CRACKLE]

/** Moments the screen makes, not the rules: the dice spinning and landing, a piece stepping, a button. */
export type UiSound =
  | { type: 'roll' }
  | { type: 'diceLanded' }
  /** The moving piece reaches a square: `entered` when it has just come out of its yard, `last` on its final one. */
  | { type: 'pieceStep'; entered: boolean; last: boolean }
  | { type: 'tap' }

export type SoundEvent = GameEffect | UiSound

/** "On fire" shows from this many 6s. */
export const ON_FIRE = 4

/** What a kick adds on top of the impact. */
const KICK_EXTRA: Record<KickKind, SoundId[]> = {
  front: [],
  back: [],
  line: ['zap'],
  home: ['thud'],
  wicked: ['wicked'],
}

/** The sounds for a moment, in the order they start (together). */
export function soundsFor(event: SoundEvent): SoundId[] {
  switch (event.type) {
    case 'roll':
      return ['dice-rattle']
    case 'diceLanded':
      return ['dice-land']
    case 'pieceStep':
      return [event.entered ? 'enter' : event.last ? 'land' : 'step']
    case 'tap':
      return ['tap']
    case 'kick':
      // The impact, the kind's own hit, and the kicked piece whooshing back to its yard.
      return ['kick', ...KICK_EXTRA[event.kind], 'whoosh']
    case 'sixStreak':
      return event.count === ON_FIRE ? ['on-fire'] : []
    case 'labourerStart':
      return ['chains']
    case 'labourerFreed':
      return ['shatter']
    case 'pieceHome':
      return ['home']
    case 'gameOver':
      return ['fanfare']
    default:
      return []
  }
}

/** The crackle under a six streak: none for a single 6, then louder with each one. */
export function crackleVolume(count: number): number {
  if (count < 2) return 0
  return Math.min(0.5, 0.15 + 0.08 * (count - 2))
}

/** The big moments the music dips under: kicks, "On fire" and the end of the game. */
export function ducksMusic(event: SoundEvent): boolean {
  return event.type === 'kick' || event.type === 'gameOver' || (event.type === 'sixStreak' && event.count === ON_FIRE)
}

/** Called once for every effect as it plays, and for the screen's own moments. */
export function playSound(event: SoundEvent): void {
  for (const id of soundsFor(event)) audio.play(id, SOUNDS[id])
  if (ducksMusic(event)) audio.duck()
}

/** Buttons that tap: the big ones and menu rows, not the board (pieces and targets have their move sounds). */
const TAPPABLE = 'button.primary, button.secondary, button.sheet-row, button.menu-button, button.row, button.icon-button, button.seat-button'

/** One listener for every button's tap. */
export function listenForTaps(target: Document = document): () => void {
  const onClick = (event: Event) => {
    if ((event.target as Element).closest(TAPPABLE)) playSound({ type: 'tap' })
  }
  target.addEventListener('click', onClick)
  return () => target.removeEventListener('click', onClick)
}
