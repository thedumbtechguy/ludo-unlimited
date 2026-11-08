import type { GameEvent, GameState, Settings } from '@ludo/engine'
import { useState } from 'react'
import type { Dice } from './dice'
import { GameScreen } from './screens/GameScreen'
import { Home } from './screens/Home'
import { Results } from './screens/Results'
import { Setup } from './screens/Setup'
import { clearGame, loadGame, loadHand, saveGame, saveHand } from './storage'
import type { Hand, Seats } from './types'
import type { Timing } from './useGame'

type Screen =
  | { name: 'home' }
  | { name: 'setup' }
  | { name: 'game'; settings: Settings; seats: Seats; log?: GameEvent[]; key: number }
  | { name: 'results'; game: GameState; settings: Settings; seats: Seats }

export function App({ dice, timing }: { dice: Dice; timing: Timing }) {
  const [screen, setScreen] = useState<Screen>({ name: 'home' })
  const [saved, setSaved] = useState(loadGame)
  const [hand, setHand] = useState(loadHand)
  const changeHand = (next: Hand) => {
    saveHand(next)
    setHand(next)
  }

  const startGame = (settings: Settings, seats: Seats, log?: GameEvent[]) =>
    setScreen({ name: 'game', settings, seats, log, key: Date.now() })
  const goHome = () => {
    setSaved(loadGame())
    setScreen({ name: 'home' })
  }

  switch (screen.name) {
    case 'home':
      return (
        <Home
          canContinue={saved !== undefined}
          hand={hand}
          onNew={() => setScreen({ name: 'setup' })}
          onContinue={() => startGame(saved!.settings, saved!.seats, saved!.log)}
        />
      )
    case 'setup':
      return <Setup onBack={goHome} onStart={(settings, seats) => startGame(settings, seats)} hand={hand} onHand={changeHand} />
    case 'game':
      return (
        <GameScreen
          key={screen.key}
          options={{
            settings: screen.settings,
            seats: screen.seats,
            log: screen.log,
            dice,
            timing,
            onChange: (game) => saveGame({ settings: screen.settings, seats: screen.seats, log: game.log }),
          }}
          hand={hand}
          onHand={changeHand}
          onQuit={goHome}
          onRestart={() => startGame(screen.settings, screen.seats)}
          onFinish={(game) => {
            clearGame()
            setSaved(undefined)
            setScreen({ name: 'results', game, settings: screen.settings, seats: screen.seats })
          }}
        />
      )
    case 'results':
      return <Results game={screen.game} onPlayAgain={() => startGame(screen.settings, screen.seats)} onHome={goHome} />
  }
}
