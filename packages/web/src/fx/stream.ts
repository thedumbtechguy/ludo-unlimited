import type { GameEffect } from '@ludo/engine'
import { useEffect, useRef } from 'react'

/** An effect as it happened; ids only ever grow, so a listener can tell new ones from old. */
export type EffectEvent = GameEffect & { id: number }

/**
 * Calls `onEffect` once for each effect that arrives after mounting, in order. Re-renders and
 * remounts never replay an effect already seen.
 */
export function useEffectStream(effects: EffectEvent[], onEffect: (effect: EffectEvent) => void): void {
  const seen = useRef(effects.at(-1)?.id ?? 0)
  const handler = useRef(onEffect)
  handler.current = onEffect
  useEffect(() => {
    for (const effect of effects) {
      if (effect.id <= seen.current) continue
      seen.current = effect.id
      handler.current(effect)
    }
  }, [effects])
}
