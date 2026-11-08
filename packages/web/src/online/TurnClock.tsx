import { useEffect, useState } from 'react'

const WARN_MS = 10_000

/** A ring round the dice that drains until `deadline`, in the warning colour for the last 10 seconds. */
export function TurnClock({ deadline, total }: { deadline: number; total: number }) {
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    setNow(Date.now())
    const id = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(id)
  }, [deadline])
  const left = Math.max(0, deadline - now)
  const share = Math.min(1, left / total)
  return (
    <svg className={`turn-clock${left < WARN_MS ? ' warn' : ''}`} viewBox="0 0 100 100" role="img" aria-label={`${Math.ceil(left / 1000)} seconds left`}>
      <circle cx="50" cy="50" r="47" pathLength="1" strokeDasharray={`${share} 1`} />
    </svg>
  )
}
