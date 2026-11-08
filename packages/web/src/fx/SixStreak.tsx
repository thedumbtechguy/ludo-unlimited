import type { Color } from '@ludo/engine'
import { useEffect, useRef, useState, type RefObject } from 'react'
import { anchor, burner, ember, emberRate, flame, flameRate, heat } from './fire'
import { useFx, type EmitterHandle } from './FxLayer'
import type { Make } from './particles'
import { useEffectStream, type EffectEvent } from './stream'

/** The fire dies down over this long when a streak ends. */
export const DIE_DOWN_MS = 600

export type Streak = { count: number; /** The id of the latest 6, to pop the dice once per 6. */ six: number }

/** The turn player's run of 6s, from the effect stream: back to 0 when it ends or the turn moves on. */
export function useSixStreak(effects: EffectEvent[], turn: Color): Streak {
  const [streak, setStreak] = useState<Streak>({ count: 0, six: 0 })
  useEffectStream(effects, (effect) => {
    if (effect.type === 'sixStreak') setStreak({ count: effect.count, six: effect.id })
    if (effect.type === 'streakEnded') setStreak((s) => ({ ...s, count: 0 }))
  })
  useEffect(() => setStreak((s) => (s.count === 0 ? s : { ...s, count: 0 })), [turn])
  return streak
}

/** Where the flames start: the bottom of the dice's cube, a little above the button's bottom edge. */
const DICE_BASE = 0.8
const DICE_TOP = 0.15

/**
 * The dice's six-streak fire, all drawn on the particle layer: a pop per 6, embers from two 6s,
 * flames wrapping the dice from three, hotter with each 6 after. The streak ending dies it down.
 */
export function DiceFire({ dice, streak }: { dice: RefObject<HTMLElement>; streak: Streak }) {
  const fx = useFx()
  const full = fx.enabled && fx.level === 'full'
  const embers = useRef<EmitterHandle>()
  const flames = useRef<EmitterHandle>()
  const { count, six } = streak

  useEffect(() => {
    if (!full || six === 0) return
    const pop = dice.current?.animate(
      [
        { transform: 'scale(1)', filter: 'brightness(1)' },
        { transform: 'scale(1.14)', filter: 'brightness(1.18) saturate(1.3)', offset: 0.35 },
        { transform: 'scale(1)', filter: 'brightness(1)' },
      ],
      { duration: 300, easing: 'cubic-bezier(.2,.9,.3,1.3)' },
    )
    return () => pop?.cancel()
  }, [six, full])

  useEffect(() => {
    const width = () => dice.current?.getBoundingClientRect().width ?? 0
    const dieDown = (handle: typeof embers) => {
      handle.current?.fade(full ? DIE_DOWN_MS : 0)
      handle.current = undefined
    }
    if (!full || count < 2) {
      dieDown(embers)
      dieDown(flames)
      return
    }
    const emberMake = ember(width() * 0.7)
    if (embers.current) embers.current.set({ rate: emberRate(count), make: emberMake })
    else embers.current = fx.emitter({ rate: emberRate(count), at: () => anchor(dice.current, DICE_TOP), make: emberMake })
    if (count < 3) {
      dieDown(flames)
      return
    }
    const flameMake = flame(width() * 0.8, heat(count))
    if (flames.current) flames.current.set({ rate: flameRate(heat(count)), make: flameMake })
    else flames.current = fx.emitter({ rate: flameRate(heat(count)), at: () => anchor(dice.current, DICE_BASE), make: flameMake })
  }, [count, full, fx])

  useEffect(
    () => () => {
      embers.current?.stop()
      flames.current?.stop()
    },
    [],
  )

  return null
}

/**
 * "On fire" from four 6s: slams in, a small flame under it, and fades as the fire dies down.
 * `place` picks the phone spot (above the board) or the desktop one (above the dice); CSS shows one.
 */
export function OnFire({ count, place }: { count: number; place: 'phone' | 'desk' }) {
  const fx = useFx()
  const full = fx.enabled && fx.level === 'full'
  const lit = full && count >= 4
  const [shown, setShown] = useState(lit)
  const text = useRef<HTMLParagraphElement>(null)

  useEffect(() => {
    if (lit) return setShown(true)
    const id = setTimeout(() => setShown(false), DIE_DOWN_MS)
    return () => clearTimeout(id)
  }, [lit])

  useEffect(() => {
    if (!lit) return
    // Measured without the slam-in scale (the text's laid-out width), once the text is on screen.
    const make: Make = (rand) => burner((text.current?.offsetWidth ?? 0) * 0.75, text.current?.offsetHeight ?? 0)(rand)
    const handle = fx.emitter({ rate: 220, at: () => anchor(text.current, 0.9), make })
    return () => handle.fade(DIE_DOWN_MS)
  }, [lit, fx])

  if (!shown) return null
  return (
    <p ref={text} className={`on-fire on-fire-${place}${lit ? '' : ' leaving'}`} aria-hidden="true">
      On fire
    </p>
  )
}

/** Reduced effects: a small, still "6 × 3" by the dice instead of fire. */
export function StreakLabel({ count }: { count: number }) {
  const fx = useFx()
  if (!fx.enabled || fx.level !== 'reduced' || count < 2) return null
  return (
    <span className="streak-label" aria-hidden="true">
      6 × {count}
    </span>
  )
}
