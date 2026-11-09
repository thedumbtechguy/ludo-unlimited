import { LEVELS, type Level, type Settings, type TurnTimer } from '@ludo/engine'

/** Room code letters: no I, L or O, so a code read out loud or off a screen can't be mistaken. */
export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ'

export const makeCode = (random: () => number): string =>
  Array.from({ length: 4 }, () => CODE_ALPHABET[Math.floor(random() * CODE_ALPHABET.length)]).join('')

/** A nickname: no control or invisible characters, trimmed, single-spaced, at most 16 characters. */
export function cleanName(name: unknown): string | undefined {
  if (typeof name !== 'string') return undefined
  const clean = name.replace(/[\p{Cc}\p{Cf}]/gu, '').trim().replace(/\s+/g, ' ').slice(0, 16)
  return clean || undefined
}

const RULE_KEYS = ['backKick', 'lineKick', 'homeKick', 'labourer'] as const

export function validSettings(value: unknown): value is Settings {
  if (typeof value !== 'object' || value === null) return false
  const s = value as Record<string, unknown>
  const rules = s.rules as Record<string, unknown> | undefined
  return (
    [2, 3, 4].includes(s.players as number) &&
    ['firstWins', 'playForPlaces'].includes(s.endCondition as string) &&
    ['endsTurn', 'normal', 'bonusRoll'].includes(s.afterKick as string) &&
    typeof rules === 'object' &&
    rules !== null &&
    RULE_KEYS.every((key) => typeof rules[key] === 'boolean')
  )
}

/** Only the fields the game knows, so a room never stores anything extra it was sent. */
export function cleanSettings({ players, endCondition, afterKick, rules }: Settings): Settings {
  const { backKick, lineKick, homeKick, labourer } = rules
  return { players, endCondition, afterKick, rules: { backKick, lineKick, homeKick, labourer } }
}

export const validTimer = (value: unknown): value is TurnTimer => ['relaxed', 'normal', 'quick', 'off'].includes(value as string)

export const validLevel = (value: unknown): value is Level => (LEVELS as readonly unknown[]).includes(value)
