import { createGame, settingsFor } from '@ludo/engine'
import { Board } from '../components/Board'
import { quarterTurns } from '../layout'
import type { Hand } from '../types'

const START = createGame(settingsFor('ghana', 4, 'firstWins'))

type Props = { canContinue: boolean; hand: Hand; onQuick: () => void; onFind: () => void; onFriends: () => void; onNew: () => void; onContinue: () => void }

export function Home({ canContinue, hand, onQuick, onFind, onFriends, onNew, onContinue }: Props) {
  return (
    <main className="screen home">
      <h1>Ludo Unlimited</h1>
      <p>Ludo with Ghanaian kicks.</p>
      <div className="home-actions">
        <button type="button" className="primary" onClick={onQuick}>
          Quick match
        </button>
        <button type="button" className="secondary" onClick={onFind}>
          Find a game
        </button>
        <button type="button" className="secondary" onClick={onFriends}>
          Play with friends
        </button>
        <h2 className="home-local">On this device</h2>
        {canContinue && (
          <button type="button" className="secondary" onClick={onContinue}>
            Continue
          </button>
        )}
        <button type="button" className="secondary" onClick={onNew}>
          New game
        </button>
      </div>
      <div className="home-board" aria-hidden="true">
        <Board state={START} turn={quarterTurns('red', hand)} />
      </div>
    </main>
  )
}
