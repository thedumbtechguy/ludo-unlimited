import { createGame, settingsFor } from '@ludo/engine'
import { Board } from '../components/Board'
import { quarterTurns } from '../layout'
import type { Hand } from '../types'

const START = createGame(settingsFor('ghana', 4, 'firstWins'))

type Props = { canContinue: boolean; hand: Hand; onNew: () => void; onContinue: () => void; onOnline: () => void }

export function Home({ canContinue, hand, onNew, onContinue, onOnline }: Props) {
  return (
    <main className="screen home">
      <h1>Ludo Unlimited</h1>
      <p>Ludo with Ghanaian kicks.</p>
      <div className="home-actions">
        <button type="button" className="primary" onClick={onNew}>
          New game
        </button>
        {canContinue && (
          <button type="button" className="secondary" onClick={onContinue}>
            Continue
          </button>
        )}
        <button type="button" className="secondary" onClick={onOnline}>
          Play online
        </button>
      </div>
      <div className="home-board" aria-hidden="true">
        <Board state={START} turn={quarterTurns('red', hand)} />
      </div>
    </main>
  )
}
