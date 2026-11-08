import type { GameState } from '@ludo/engine'
import { COLOR_NAME, ORDINAL } from '../labels'
import { COLOR_HEX } from '../theme'

export function Results({ game, onPlayAgain, onHome }: { game: GameState; onPlayAgain: () => void; onHome: () => void }) {
  const ranked = [...game.players].sort((a, b) => (a.finishedPlace ?? 99) - (b.finishedPlace ?? 99))
  return (
    <main className="screen results">
      <h1>Game over</h1>
      <ol>
        {ranked.map((p) => (
          <li key={p.color} className="row">
            <span className="dot" style={{ background: COLOR_HEX[p.color] }} />
            <span className="row-label">{COLOR_NAME[p.color]}</span>
            {p.finishedPlace && <span className="row-value">{ORDINAL[p.finishedPlace - 1]}</span>}
          </li>
        ))}
      </ol>
      <div className="results-actions">
        <button type="button" className="primary" onClick={onPlayAgain}>
          Play again
        </button>
        <button type="button" className="secondary" onClick={onHome}>
          Home
        </button>
      </div>
    </main>
  )
}
