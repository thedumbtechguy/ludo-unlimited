import { useEffect, useState } from 'react'
import { useFx } from '../fx/FxLayer'
import { COLOR_HEX } from '../theme'
import type { Callout } from '../useGame'

export const CALLOUT_MS = 1400

/**
 * Big outlined text over the board for a kick, then gone. With full effects it slams in; reduced, it
 * fades in and out. The status line speaks it.
 */
export function KickCallout({ callout }: { callout?: Callout }) {
  const [shown, setShown] = useState(callout)
  const fx = useFx()
  const slam = fx.enabled && fx.level === 'full'

  useEffect(() => {
    setShown(callout)
    if (!callout) return
    const id = setTimeout(() => setShown(undefined), CALLOUT_MS)
    return () => clearTimeout(id)
  }, [callout?.id])

  if (!shown) return null
  return (
    <div key={shown.id} className={slam ? 'kick-callout slam' : 'kick-callout'} aria-hidden="true">
      <p className="kick-title" style={{ color: COLOR_HEX[shown.color] }}>
        {shown.title}
      </p>
      <p className="kick-line">{shown.line}</p>
    </div>
  )
}
