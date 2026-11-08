import type { GameState } from '@ludo/engine'
import { COLOR_NAME } from '../labels'
import { COLOR_HEX } from '../theme'

const ORDINAL = ['1st', '2nd', '3rd', '4th']

export function Results({ game, onPlayAgain, onHome }: { game: GameState; onPlayAgain: () => void; onHome: () => void }) {
  const ranked = [...game.players].sort((a, b) => (a.finishedPlace ?? 99) - (b.finishedPlace ?? 99))
  return (
    <main className="screen results">
      <h1>Game over</h1>
      <ol>
        {ranked.map((p) => (
          <li key={p.color}>
            <span className="dot" style={{ background: COLOR_HEX[p.color] }} />
            {COLOR_NAME[p.color]}
            {p.finishedPlace ? ` — ${ORDINAL[p.finishedPlace - 1]}` : ''}
          </li>
        ))}
      </ol>
      <div className="actions">
        <button type="button" className="secondary" onClick={onHome}>
          Home
        </button>
        <button type="button" className="primary" onClick={onPlayAgain}>
          Play again
        </button>
      </div>
    </main>
  )
}
