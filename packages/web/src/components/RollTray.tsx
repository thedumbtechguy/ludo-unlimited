import { PIPS } from './DiceButton'

type Props = {
  rolls: number[]
  /** Index of the roll being played now; undefined while still rolling. */
  current?: number
  /** How many rolls, from `current`, a previewed move would use. */
  using?: number
}

/** This turn's rolls as small die faces; the one being played now is outlined. */
export function RollTray({ rolls, current, using = 0 }: Props) {
  const inUse = (i: number) => current !== undefined && using > 1 && i >= current && i < current + using
  return (
    <ol className="roll-tray" aria-label="Rolls this turn">
      {rolls.map((n, i) => {
        const now = i === current
        return (
          <li key={i} className={['chip', now && 'now', inUse(i) && 'using'].filter(Boolean).join(' ')}>
            <span className="chip-pips" aria-hidden="true">
              {Array.from({ length: 9 }, (_, p) => (
                <span key={p} className={PIPS[n].includes(p) ? 'chip-pip on' : 'chip-pip'} />
              ))}
            </span>
            <span className="sr-only">{now ? `${n}, playing now` : `${n}`}</span>
          </li>
        )
      })}
    </ol>
  )
}
