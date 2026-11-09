import { useEffect, useState } from 'react'

/** Whole seconds until `at` (a local time), ticking down; undefined without one. */
export function useSecondsLeft(at: number | undefined): number | undefined {
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    if (at === undefined) return
    setNow(Date.now())
    const timer = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(timer)
  }, [at])
  return at === undefined ? undefined : Math.max(0, Math.ceil((at - now) / 1000))
}
