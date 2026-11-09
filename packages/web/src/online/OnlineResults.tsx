import type { Color, GameState } from '@ludo/engine'
import { ORDINAL } from '../labels'
import { COLOR_HEX } from '../theme'
import { useSecondsLeft } from './useSecondsLeft'

/** `quick`: a quick room, whose next game starts by itself at `nextAt` (a local time). */
type Props = {
  game: GameState
  names: Partial<Record<Color, string>>
  host: boolean
  hostName?: string
  quick?: boolean
  nextAt?: number
  onRematch: () => void
  onLeave: () => void
}

/** The results with the players' names. Only the host starts a rematch; a quick room starts its own. */
export function OnlineResults({ game, names, host, hostName, quick, nextAt, onRematch, onLeave }: Props) {
  const seconds = useSecondsLeft(nextAt)
  const ranked = [...game.players].sort((a, b) => (a.finishedPlace ?? 99) - (b.finishedPlace ?? 99))
  return (
    <main className="screen results">
      <h1>Game over</h1>
      <ol>
        {ranked.map((p) => (
          <li key={p.color} className="row">
            <span className="dot" style={{ background: COLOR_HEX[p.color] }} />
            <span className="row-label">{names[p.color]}</span>
            {p.finishedPlace && <span className="row-value">{ORDINAL[p.finishedPlace - 1]}</span>}
          </li>
        ))}
      </ol>
      <div className="results-actions">
        {quick ? (
          <p className="results-waiting">{seconds === undefined ? 'Next game soon' : `Next game in ${seconds} s`}</p>
        ) : host ? (
          <button type="button" className="primary" onClick={onRematch}>
            Rematch
          </button>
        ) : (
          <p className="results-waiting">Waiting for {hostName ?? 'the host'}</p>
        )}
        <button type="button" className="secondary" onClick={onLeave}>
          Leave
        </button>
      </div>
    </main>
  )
}
