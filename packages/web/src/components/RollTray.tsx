type Props = {
  rolls: number[]
  /** Index of the roll being played now; undefined while still rolling. */
  current?: number
  /** How many rolls, from `current`, a previewed move would use. */
  using?: number
}

/** This turn's rolls as numbers; the one being played now is outlined in the player's colour. */
export function RollTray({ rolls, current, using = 0 }: Props) {
  const inUse = (i: number) => current !== undefined && using > 1 && i >= current && i < current + using
  return (
    <ol className="roll-tray" aria-label="Rolls this turn">
      {rolls.map((n, i) => {
        const now = i === current
        return (
          <li key={i} className={['chip', now && 'now', inUse(i) && 'using'].filter(Boolean).join(' ')}>
            {n}
            {now && <span className="sr-only">, now</span>}
          </li>
        )
      })}
    </ol>
  )
}
