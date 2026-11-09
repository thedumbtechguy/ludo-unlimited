import type { EndCondition, Settings } from './types'

export type Mode = Pick<Settings, 'rules' | 'afterKick'>

/** Named rule presets. Player count and end condition are chosen separately at setup. */
export const MODES = {
  classic: {
    rules: { backKick: false, lineKick: false, homeKick: false, labourer: false },
    afterKick: 'normal',
  },
  ghana: {
    rules: { backKick: true, lineKick: true, homeKick: true, labourer: true },
    afterKick: 'normal',
  },
} as const satisfies Record<string, Mode>

export type ModeName = keyof typeof MODES

export function settingsFor(mode: ModeName, players: Settings['players'], endCondition: EndCondition): Settings {
  const { rules, afterKick } = MODES[mode]
  return { players, endCondition, rules: { ...rules }, afterKick }
}

/** The mode these settings are, or undefined when the rules were chosen one by one. */
export const modeOfSettings = (s: Mode): ModeName | undefined =>
  (Object.keys(MODES) as ModeName[]).find(
    (name) => s.afterKick === MODES[name].afterKick && Object.entries(MODES[name].rules).every(([key, on]) => s.rules[key as keyof Settings['rules']] === on),
  )
